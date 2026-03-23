#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};

// Tauri v2
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

// ==================== PDF UTILS ====================

#[tauri::command]
async fn read_pdf_as_base64(path: String) -> Result<String, String> {
    fs::read(&path)
        .map(|bytes| general_purpose::STANDARD.encode(bytes))
        .map_err(|e| format!("Erreur lecture fichier: {}", e))
}

#[tauri::command]
async fn save_pdf_from_base64(
    base64_data: String,
    default_name: String,
    app: AppHandle
) -> Result<String, String> {

    let bytes = general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Erreur décodage base64: {}", e))?;

    let (tx, rx) = oneshot::channel();

    app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("PDF", &["pdf"])
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let file_path = rx.await
        .map_err(|_| "Erreur ouverture dialog".to_string())?
        .ok_or_else(|| "Sauvegarde annulée".to_string())?;

    let path = file_path
        .as_path()
        .ok_or_else(|| "Chemin invalide".to_string())?;

    fs::write(path, bytes)
        .map_err(|e| format!("Erreur écriture fichier: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}


// ==================== GEMINI STRUCTURES ====================

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
}

#[derive(Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum GeminiPart {
    Text { text: String },
    InlineData { inlineData: InlineData },
}

#[derive(Serialize)]
struct InlineData {
    mimeType: String,
    data: String,
}

// ==================== GEMINI RESPONSE ====================

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: GeminiContentResponse,
}

#[derive(Deserialize)]
struct GeminiContentResponse {
    parts: Vec<GeminiPartResponse>,
}

#[derive(Deserialize)]
struct GeminiPartResponse {
    text: Option<String>,
}

// ==================== GEMINI COMMAND ====================

#[tauri::command]
async fn extract_pcmi_data(
    pdf_base64: String,
    prompt: String,
    api_key: String,
) -> Result<String, String> {

    println!("➡️ extract_pcmi_data appelée");
    println!("📄 PDF base64 size = {}", pdf_base64.len());
    println!("🧠 Prompt size = {}", prompt.len());

    let client = reqwest::Client::new();

    let body = GeminiRequest {
        contents: vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![
                GeminiPart::InlineData {
                    inlineData: InlineData {
                        mimeType: "application/pdf".to_string(),
                        data: pdf_base64,
                    },
                },
                GeminiPart::Text { text: prompt },
            ],
        }],
    };

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        api_key
    );

    println!("🌐 Appel Gemini…");

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("❌ Erreur requête Gemini: {}", e))?;

    let status = response.status();
    println!("📡 Statut Gemini: {}", status);

    let raw_text = response
        .text()
        .await
        .map_err(|e| format!("❌ Lecture réponse Gemini: {}", e))?;

    if !status.is_success() {
        return Err(format!("❌ Gemini HTTP error: {}", raw_text));
    }

    // Parser la réponse Gemini
    let gemini_response: GeminiResponse = serde_json::from_str(&raw_text)
        .map_err(|e| format!("❌ Parse réponse Gemini: {}", e))?;

    // Extraire le texte
    let text_content = gemini_response
        .candidates
        .get(0)
        .and_then(|c| c.content.parts.get(0))
        .and_then(|p| p.text.as_ref())
        .ok_or_else(|| "❌ Pas de texte dans la réponse".to_string())?;

    println!("📝 Texte brut (200 chars): {}", &text_content[..text_content.len().min(200)]);

    // Extraire le JSON du markdown
    // Extraire le JSON du markdown
    use regex::Regex;
    let re = Regex::new(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```")
        .map_err(|e| format!("❌ Regex error: {}", e))?;

    let json_str = match re.captures(text_content) {
        Some(caps) => caps.get(1).unwrap().as_str().trim().to_string(),
        None => text_content.trim().to_string()
    };

    // Valider que c'est du JSON valide
    let _: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("❌ JSON invalide: {}", e))?;

    println!("✅ JSON validé (200 chars): {}", &json_str[..json_str.len().min(200)]);

    Ok(json_str)
}

// ==================== MAIN ====================

fn main() {
    tauri::Builder::new()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_pdf_as_base64,
            save_pdf_from_base64,
            extract_pcmi_data
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de l'application");
}
