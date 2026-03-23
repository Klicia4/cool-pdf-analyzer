import { invoke } from "@tauri-apps/api/core";

/* ==================== TYPES ==================== */

export interface PCMIData {
  demandeur: {
    identite: {
      nom: string | null;
      prenom: string | null;
      denominationSociale: string | null;
      raisonSociale: string | null;
      numeroSIRET: string | null;
      typeDeSociete: string | null;
      nomRepresentantLegal: string | null;
      prenomRepresentantLegal: string | null;
    };
    adresse: {
      numero: string | null;
      voie: string | null;
      lieuDit: string | null;
      codePostal: string;
      ville: string;
      bP: string | null;
      cedex: string | null;
      pays: string | null;
      divisionTerritoriale: string | null;
    };
    contact: {
      telephone: string | null;
      indicatifTel: string | null;
      email: string | null;
    };
  };

  terrain: {
    adresseComplete: string | null;
    localisation: {
      numero: string | null;
      voie: string | null;
      lieuDit: string | null;
      localite: string;
      codePostal: string;
    };
    referencesCadastrales: {
      section: string[];
      numeroParcelle: string[];
      superficie: string[];
    };
  };

  projet: {
    caracteristiques: {
      nature: string;
      description: string;
      nombreNiveaux: string;
    };

    surfaces: {
      empriseAvantTravaux: string;
      empriseCree: string;
      empriseSupprimee: string;

      surfacePlancherTotaleAvant: string;
      surfacePlancherTotaleApres: string;

      // ⚠️ DEPRECATED - Conservé pour compatibilité mais non utilisé
      surfacePlancherExistante: string;
      surfacePlancherCree: string;
      surfacePlancherCreeParChangement: string;
      surfacePlancherSupprimeeParChangement: string;
      surfacePlancherSupprimee: string;
    };

    /** 🔴 TABLEAU 4.5 - Structure complète avec lignes */
    tableau45: {
      /** 
       * ⚠️ OBLIGATOIRE : Tableau des lignes du formulaire 4.5
       * Chaque ligne représente une destination/sous-destination concernée par le projet
       */
      lignes: Array<{
        /** Destination principale (5 choix possibles) */
        destination:
          | "Exploitation agricole et forestière"
          | "Habitation"
          | "Commerce et activités de service"
          | "Équipements d'intérêt collectif et services publics"
          | "Autres activités des secteurs primaire, secondaire ou tertiaire";

        /** Sous-destination précise (ex: "Logement", "Exploitation agricole", etc.) */
        sousDestination: string;

        /** Colonne A : Surface existante avant travaux */
        surfaceExistanteA: string;

        /** Colonne B : Surface créée par construction neuve */
        surfaceCreeeB: string;

        /** Colonne C : Surface créée par changement de destination */
        surfaceCreeParChangementC: string;

        /** Colonne D : Surface supprimée physiquement */
        surfaceSupprimeeD: string;

        /** Colonne E : Surface supprimée par changement de destination */
        surfaceSupprimeeParChangementE: string;

        /** Colonne F : Surface totale = A + B + C - D - E */
        surfaceTotale: string;
      }>;

      /** 
       * 📝 METADATA (optionnel) - Pour information uniquement
       * Ces champs ne sont plus utilisés pour le remplissage du PDF
       */
      destinationAvant?: string | null;
      sousDestinationAvant?: string | null;
      destinationApres?: string | null;
      sousDestinationApres?: string | null;
      ligneAvant?: string | null;
      ligneApres?: string | null;
    };
  };
}

/* ==================== EXTRACTION PCMI ==================== */

export async function extractPCMIData(pdfBase64: string): Promise<PCMIData> {
  
  const prompt = `Tu es un expert en urbanisme français et en extraction de données depuis des documents administratifs PCMI (Permis de Construire).

Ton objectif est d'analyser un dossier PCMI et d'en extraire des informations STRUCTURÉES, NORMALISÉES et JURIDIQUEMENT COHÉRENTES, afin de permettre le remplissage correct du formulaire administratif, notamment le tableau 4.5 : "Destination, sous-destination des constructions et tableau des surfaces", conformément aux articles R.111-22, R.151-27 et R.151-28 du Code de l'urbanisme.

---

## 📐 RÈGLES DE NORMALISATION DES CONTACTS
### TÉLÉPHONE
- **Format français** : retirer TOUS les espaces, tirets, points, parenthèses
- Exemples de normalisation :
  - "06 12 34 56 78" → "0612345678"
  - "06.12.34.56.78" → "0612345678"
  - "06-12-34-56-78" → "0612345678"
  - "+33 6 12 34 56 78" → "+33612345678"
  - "(06) 12 34 56 78" → "0612345678"
- **IMPORTANT** : Le numéro doit être une chaîne continue de chiffres (avec éventuellement le préfixe +33)
**RÈGLE CRITIQUE** : Le téléphone DOIT être une chaîne continue sans aucun espace ni caractère spécial (sauf + pour l'international).

### EMAIL
- Le système séparera automatiquement la partie avant et après @ lors du remplissage du formulaire.


## 📘 DÉFINITIONS RÉGLEMENTAIRES (À RESPECTER STRICTEMENT)

- **Surface de plancher existante (A)** :
  Surface de plancher existante AVANT travaux, par destination et sous-destination.

- **Surface créée (B)** :
  Surface de plancher créée par construction nouvelle ou par transformation d'un local NON constitutif de surface de plancher (ex : garage transformé en chambre).

- **Surface créée par changement de destination ou de sous-destination (C)** :
  Surface de plancher existante conservée physiquement mais dont l'usage change.
  Cette surface PROVIENT d'une autre destination/sous-destination.

- **Surface supprimée (D)** :
  Surface de plancher supprimée physiquement (démolition ou transformation en local non constitutif de surface de plancher).

- **Surface supprimée par changement de destination ou de sous-destination (E)** :
  Surface de plancher retirée de sa destination ou sous-destination initiale du fait d'un changement d'usage.
  Cette surface PART vers une autre destination/sous-destination.

⚠️ RÈGLES ABSOLUES :
- Toute surface inscrite en (C) DOIT avoir une surface équivalente inscrite en (E) sur la ligne d'origine.
- Une surface ne peut apparaître qu'une seule fois dans le tableau.
- Si le projet est uniquement un changement de destination :
  - (B) = 0
  - (D) = 0
- La cohérence suivante DOIT être respectée :
  **Surface finale = A + B + C − D − E**

---

## 🧮 MÉTHODE DE CALCUL DES SURFACES (TRÈS IMPORTANT)

### Étape 1 : Identifier les surfaces totales avant et après
À partir des données du dossier, extraire :
- Surface de plancher AVANT travaux par destination (ex: agricole = 219.78 m², habitation = 240.00 m²)
- Surface de plancher APRÈS travaux par destination (ex: agricole = 51.26 m², habitation = 389.09 m²)
- Surface de plancher TOTALE avant et après

### Étape 2 : Calculer les transferts de surface
Pour chaque destination qui PERD de la surface :
- **Surface supprimée par changement (E)** = Surface avant - Surface après
  Exemple : Exploitation agricole → 219.78 - 51.26 = **168.52 m²** en colonne (E)

Pour chaque destination qui GAGNE de la surface :
- **Surface créée par changement (C)** = La surface reçue d'une autre destination
  Exemple : Habitation → reçoit **168.52 m²** en colonne (C)

### Étape 3 : Calculer la perte nette totale (si applicable)
Si la surface totale diminue :
- Perte totale = Surface totale avant - Surface totale après
  Exemple : 459.78 - 440.35 = **19.43 m²**
- Cette perte doit être inscrite en colonne (D) "Surface supprimée" sur la destination appropriée

### Étape 4 : Vérifier la cohérence
Pour chaque ligne du tableau :
- Vérifier que : **Surface finale = A + B + C - D - E**
- Vérifier que la somme des (C) = somme des (E) (principe de conservation)
- Vérifier que la surface finale correspond bien à la surface après travaux mentionnée

### Exemple concret de remplissage :

**Cas : Changement de destination Exploitation agricole → Habitation**

Données du dossier :
- Surface agricole avant : 219.78 m²
- Surface agricole après : 51.26 m²
- Surface habitation avant : 240.00 m²
- Surface habitation après : 389.09 m²
- Surface totale avant : 459.78 m²
- Surface totale après : 440.35 m²

**LIGNE 1 : "Exploitation agricole - Exploitation agricole" :**
- (A) = 219.78 (existant avant)
- (B) = 0 (pas de création)
- (C) = 0 (ne reçoit rien)
- (D) = 0 (pas de démolition)
- (E) = 168.52 (part vers habitation : 219.78 - 51.26)
- **Total = 219.78 + 0 + 0 - 0 - 168.52 = 51.26** ✓

**LIGNE 2 : "Habitation - Logement" :**
- (A) = 240.00 (existant avant)
- (B) = 0 (pas de construction neuve)
- (C) = 168.52 (reçoit de l'exploitation agricole)
- (D) = 19.43 (perte nette totale : 459.78 - 440.35)
- (E) = 0 (ne cède rien)
- **Total = 240.00 + 0 + 168.52 - 19.43 - 0 = 389.09** ✓

---

## 🔍 DÉTECTION AUTOMATIQUE DU TYPE DE PROJET

Tu dois analyser les données et déterminer automatiquement :

1. **Changement de destination pur** :
   - Pas de modification de la surface totale OU légère diminution
   - Une destination perd exactement ce qu'une autre gagne
   - (B) = 0, (D) = 0 ou faible

2. **Extension/Construction neuve** :
   - Augmentation de la surface totale
   - (B) > 0
   - (C) peut être = 0

3. **Projet mixte** :
   - Changement de destination + création
   - (B) > 0 ET (C) > 0

4. **Démolition partielle** :
   - Diminution de la surface totale
   - (D) > 0

---

## 🧾 TABLE OFFICIELLE DES LIGNES DU TABLEAU 4.5 (OBLIGATOIRE)

Tu dois TOUJOURS placer les surfaces sur UNE SEULE ligne du tableau 4.5, en fonction de la destination et de la sous-destination.

### 1. Exploitation agricole et forestière
- Exploitation agricole
- Exploitation forestière

### 2. Habitation
- Logement
- Hébergement

### 3. Commerce et activités de service
- Artisanat et commerce de détail
- Restauration
- Commerce de gros
- Activités de services avec accueil du public
- Cinéma
- Hôtels
- Autres hébergements touristiques

### 4. Équipements d'intérêt collectif et services publics
- Locaux et bureaux accueillant du public
- Locaux techniques et industriels publics
- Établissements d'enseignement, de santé et d'action sociale
- Salles d'art et de spectacles
- Équipements sportifs
- Lieux de culte
- Autres équipements recevant du public

### 5. Autres activités des secteurs primaire, secondaire ou tertiaire
- Industrie
- Entrepôt
- Bureau
- Centre de congrès et d'exposition
- Cuisine dédiée à la vente en ligne

---

## 🚨 RÈGLES STRICTES POUR LE TABLEAU 4.5

1. **UNE ligne par destination/sous-destination concernée**
2. Si changement de destination : **CRÉER 2 LIGNES** (origine + destination)
3. Si pas de changement : **UNE SEULE LIGNE**
4. Chaque ligne doit avoir les 6 colonnes : A, B, C, D, E, Total
5. La somme totale des colonnes (C) = somme totale des colonnes (E)

---

## 📤 STRUCTURE DE SORTIE EXIGÉE (JSON)

⚠️ **CRITICAL : Le champ \`tableau45.lignes\` est OBLIGATOIRE et doit contenir TOUTES les lignes nécessaires.**

{
  "demandeur": {
    "identite": {
      "nom": "string | null",
      "prenom": "string | null",
      "denominationSociale": "string | null",
      "raisonSociale": "string | null",
      "numeroSIRET": "string | null",
      "typeDeSociete": "string | null",
      "nomRepresentantLegal": "string | null",
      "prenomRepresentantLegal": "string | null"
    },
    "adresse": {
      "numero": "string | null",
      "voie": "string | null",
      "lieuDit": "string | null",
      "codePostal": "string",
      "ville": "string",
      "bP": "string | null",
      "cedex": "string | null",
      "pays": "string | null",
      "divisionTerritoriale": "string | null"
    },
    "contact": {
      "telephone": "string | null",
      "indicatifTel": "string | null",
      "email": "string | null"
    }
  },
  "terrain": {
    "adresseComplete": "string | null",
    "localisation": {
      "numero": "string | null",
      "voie": "string | null",
      "lieuDit": "string | null",
      "localite": "string",
      "codePostal": "string"
    },
    "referencesCadastrales": {
      "section": ["string"],
      "numeroParcelle": ["string"],
      "superficie": ["string"]
    }
  },
  "projet": {
    "caracteristiques": {
      "nombreNiveaux": "string",
      "nature": "string",
      "description": "string"
    },
    "surfaces": {
      "empriseAvantTravaux": "string",
      "empriseCree": "string",
      "empriseSupprimee": "string",

      "surfacePlancherTotaleAvant": "string",
      "surfacePlancherTotaleApres": "string"
    },
    "tableau45": {
      "lignes": [
        {
          "destination": "Exploitation agricole et forestière" | "Habitation" | "Commerce et activités de service" | "Équipements d'intérêt collectif et services publics" | "Autres activités des secteurs primaire, secondaire ou tertiaire",
          "sousDestination": "string",
          "surfaceExistanteA": "string",
          "surfaceCreeeB": "string",
          "surfaceCreeParChangementC": "string",
          "surfaceSupprimeeD": "string",
          "surfaceSupprimeeParChangementE": "string",
          "surfaceTotale": "string"
        }
      ]
    }
  }
}

---

## 📐 RÈGLES DE NORMALISATION

1. Extraire uniquement des surfaces de plancher (R.111-22).
2. Les emprises au sol ne doivent jamais être confondues avec les surfaces de plancher.
3. Les valeurs numériques doivent être retournées sous forme de chaîne sans unité :
   "162,5 m²" → "162.5"
4. Si une valeur numérique est absente : utiliser "0".
5. Si une valeur textuelle est absente : utiliser null.
6. Arrondir les résultats à 2 décimales maximum.

---

## 🔍 PROCESSUS D'ANALYSE OBLIGATOIRE

1. **Lire attentivement le document PC4 (Notice descriptive)** pour identifier :
   - Surface de plancher agricole AVANT
   - Surface de plancher habitation AVANT
   - Surface de plancher agricole APRÈS
   - Surface de plancher habitation APRÈS
   - Surface totale AVANT
   - Surface totale APRÈS

2. **Identifier les destinations concernées** :
   - Quelle(s) destination(s) AVANT travaux ?
   - Quelle(s) destination(s) APRÈS travaux ?

3. **Calculer les colonnes pour chaque ligne** :
   - Pour la ligne ORIGINE (celle qui perd) : remplir (A) et (E)
   - Pour la ligne DESTINATION (celle qui gagne) : remplir (A), (C), (D) et calculer Total

4. **Créer les lignes du tableau 4.5** :
   - Si changement de destination : 2 lignes minimum
   - Si pas de changement : 1 ligne

5. **Vérifier la cohérence** :
   - Somme(C) = Somme(E)
   - Chaque ligne : Total = A + B + C - D - E

6. Retourner UNIQUEMENT l'objet JSON PCMIData, sans commentaire.

---

## ⚠️ CAS PARTICULIERS À GÉRER

- Si plusieurs sous-destinations sont concernées : créer une ligne par sous-destination.
- Si le document mentionne "grange" ou "écurie" : c'est "Exploitation agricole".
- Si transformation en "logement" ou "appartement" : c'est "Habitation > Logement".
- Attention aux surfaces totales : elles peuvent diminuer (perte de hauteur sous plafond, etc.).

---

## 🎯 EXEMPLE COMPLET ATTENDU

Pour le cas : Grange (219.78 m²) → Habitation (389.09 m²) avec perte totale de 19.43 m²

\`\`\`json
{
  "projet": {
    "surfaces": {
      "surfacePlancherTotaleAvant": "459.78",
      "surfacePlancherTotaleApres": "440.35"
    },
    "tableau45": {
      "lignes": [
        {
          "destination": "Exploitation agricole et forestière",
          "sousDestination": "Exploitation agricole",
          "surfaceExistanteA": "219.78",
          "surfaceCreeeB": "0",
          "surfaceCreeParChangementC": "0",
          "surfaceSupprimeeD": "0",
          "surfaceSupprimeeParChangementE": "168.52",
          "surfaceTotale": "51.26"
        },
        {
          "destination": "Habitation",
          "sousDestination": "Logement",
          "surfaceExistanteA": "240.00",
          "surfaceCreeeB": "0",
          "surfaceCreeParChangementC": "168.52",
          "surfaceSupprimeeD": "19.43",
          "surfaceSupprimeeParChangementE": "0",
          "surfaceTotale": "389.09"
        }
      ]
    }
  }
}
\`\`\`

---

Tu dois TOUJOURS procéder avec rigueur mathématique et juridique. En cas de doute, privilégie la cohérence des calculs.

**RAPPEL FINAL : Le champ \`tableau45.lignes\` est OBLIGATOIRE. Ne jamais renvoyer un tableau vide.**
`;

  try {
    console.log("📤 Envoi du PDF vers Tauri (Gemini backend)");

    const response = await invoke<string>("extract_pcmi_data", {
      pdfBase64,
      prompt,
      apiKey: import.meta.env.VITE_GEMINI_API_KEY
    });

    console.log("📥 Réponse brute Gemini:", response.slice(0, 200), "...");

    // Nettoyage du JSON
    let text = response
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("JSON non détecté dans la réponse Gemini");
    }

    text = text.substring(firstBrace, lastBrace + 1);

    const data: PCMIData = JSON.parse(text);
    
    // ⚠️ VALIDATION CRITIQUE
    if (!data.projet?.tableau45?.lignes || data.projet.tableau45.lignes.length === 0) {
      console.error("❌ ERREUR CRITIQUE : tableau45.lignes est vide !");
      throw new Error("Le tableau 4.5 n'a pas été extrait correctement. Lignes manquantes.");
    }
    
    console.log(`✅ ${data.projet.tableau45.lignes.length} ligne(s) extraite(s) pour le tableau 4.5`);
    
    return data;

  } catch (error) {
    console.error("❌ Erreur extraction PCMI:", error);
    throw error;
  }
}
/* ==================== DEBUG DOCUMENT ==================== */

export async function debugExtraction(
  pdfBase64: string
): Promise<string> {

  const prompt = `
Analyse ce document PDF et décris :
1. Le type de document (PCMI, CERFA, autre ?)
2. Les sections principales
3. Page 1 : présence de "BÉNÉFICIAIRE" ou "MAÎTRE D'OUVRAGE"
4. Section "PCMI 4" ou "Notice descriptive"
5. Tableau des surfaces
Réponds en français de manière claire et structurée.
`;

  try {
    return await invoke<string>("extract_pcmi_data", {
      pdfBase64,
      prompt,
      apiKey: import.meta.env.VITE_GEMINI_API_KEY
    });
  } catch (error) {
    console.error("❌ Erreur debugExtraction:", error);
    throw error;
  }
}

// Ajouter cette fonction dans geminiService.ts

/**
 * Extraire les données du demandeur depuis un fichier séparé (PDF ou image)
 */
export async function extractDemandeurData(
  fileBase64: string,
  fileType: string
): Promise<{ demandeur: PCMIData['demandeur'] }> {
  
  const prompt = `Tu es un expert en extraction de données administratives françaises.

Ton objectif est d'extraire UNIQUEMENT les informations du DEMANDEUR depuis ce document.

Ce document peut être :
- Une page 1 de formulaire CERFA déjà remplie
- Une carte d'identité (CNI)
- Une capture d'écran d'un formulaire
- Un document contenant les coordonnées du demandeur

---

## 📋 DONNÉES À EXTRAIRE

### 1. IDENTITÉ
- Nom (nom de famille)
- Prénom
- Date de naissance (format: JJ/MM/AAAA)
- Lieu de naissance (commune)

OU pour une personne morale :
- Dénomination sociale
- Raison sociale
- Numéro SIRET
- Type de société
- Nom du représentant légal
- Prénom du représentant légal

### 2. ADRESSE
- Numéro de voie
- Nom de voie (rue, avenue, etc.)
- Lieu-dit (si applicable)
- Code postal
- Ville/Localité
- BP (boîte postale, si applicable)
- CEDEX (si applicable)
- Pays (si différent de France)

### 3. CONTACT
- Téléphone (format: 06 XX XX XX XX ou +33 6 XX XX XX XX)
- Indicatif téléphonique (si à l'étranger)
- Email (adresse email complète)

---

## 🚨 RÈGLES STRICTES

1. **N'extraire QUE les informations présentes** dans le document
2. Si une information n'est pas visible : mettre \`null\`
3. Ne pas inventer de données
4. Respecter exactement la structure JSON demandée
5. Normaliser les formats :
   - Téléphone : espacer tous les 2 chiffres
   - Code postal : 5 chiffres
   - Email : en minuscules

---

## 📤 STRUCTURE JSON ATTENDUE

{
  "demandeur": {
    "identite": {
      "nom": "string | null",
      "prenom": "string | null",
      "denominationSociale": "string | null",
      "raisonSociale": "string | null",
      "numeroSIRET": "string | null",
      "typeDeSociete": "string | null",
      "nomRepresentantLegal": "string | null",
      "prenomRepresentantLegal": "string | null"
    },
    "adresse": {
      "numero": "string | null",
      "voie": "string | null",
      "lieuDit": "string | null",
      "codePostal": "string",
      "ville": "string",
      "bP": "string | null",
      "cedex": "string | null",
      "pays": "string | null",
      "divisionTerritoriale": "string | null"
    },
    "contact": {
      "telephone": "string | null",
      "indicatifTel": "string | null",
      "email": "string | null"
    }
  }
}

---

## 💡 EXEMPLES

### Exemple 1 : Carte d'identité
\`\`\`json
{
  "demandeur": {
    "identite": {
      "nom": "DUPONT",
      "prenom": "Jean",
      "denominationSociale": null,
      "raisonSociale": null,
      "numeroSIRET": null,
      "typeDeSociete": null,
      "nomRepresentantLegal": null,
      "prenomRepresentantLegal": null
    },
    "adresse": {
      "numero": "12",
      "voie": "Rue de la Paix",
      "lieuDit": null,
      "codePostal": "75002",
      "ville": "Paris",
      "bP": null,
      "cedex": null,
      "pays": null,
      "divisionTerritoriale": null
    },
    "contact": {
      "telephone": "06 12 34 56 78",
      "indicatifTel": null,
      "email": "jean.dupont@email.fr"
    }
  }
}
\`\`\`

### Exemple 2 : CERFA page 1 (personne morale)
\`\`\`json
{
  "demandeur": {
    "identite": {
      "nom": null,
      "prenom": null,
      "denominationSociale": "SCI IMMO 74",
      "raisonSociale": "Société Civile Immobilière",
      "numeroSIRET": "123 456 789 00012",
      "typeDeSociete": "SCI",
      "nomRepresentantLegal": "MARTIN",
      "prenomRepresentantLegal": "Sophie"
    },
    "adresse": {
      "numero": "45",
      "voie": "Avenue des Alpes",
      "lieuDit": null,
      "codePostal": "74000",
      "ville": "Annecy",
      "bP": null,
      "cedex": null,
      "pays": null,
      "divisionTerritoriale": null
    },
    "contact": {
      "telephone": "04 50 12 34 56",
      "indicatifTel": null,
      "email": "contact@sci-immo74.fr"
    }
  }
}
\`\`\`

---

**IMPORTANT** : Retourne UNIQUEMENT le JSON, sans commentaire ni texte additionnel.

`;

  try {
    console.log(`📤 Envoi du fichier demandeur vers Gemini (type: ${fileType})`);

    const response = await invoke<string>("extract_pcmi_data", {
      pdfBase64: fileBase64,
      prompt,
      apiKey: import.meta.env.VITE_GEMINI_API_KEY
    });

    console.log("📥 Réponse Gemini (demandeur):", response.slice(0, 200), "...");

    // Nettoyage du JSON
    let text = response
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("JSON non détecté dans la réponse Gemini");
    }

    text = text.substring(firstBrace, lastBrace + 1);

    const data = JSON.parse(text);
    
    if (!data.demandeur) {
      throw new Error("Structure demandeur manquante dans la réponse");
    }
    
    console.log(`✅ Données demandeur extraites`);
    
    return data;

  } catch (error) {
    console.error("❌ Erreur extraction demandeur:", error);
    throw error;
  }
}
