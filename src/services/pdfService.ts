// src/services/pdfService.ts

import { PDFDocument, PDFForm } from 'pdf-lib';
import { PCMIData } from './geminiService';

export async function fillCERFAPDF(
  cerfaFileBuffer: ArrayBuffer,
  data: PCMIData,
  overwriteExisting: boolean = false
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(cerfaFileBuffer);
  const form = pdfDoc.getForm();

  console.log('=== REMPLISSAGE DU CERFA ===');
  console.log(`Mode: ${overwriteExisting ? 'ÉCRASER' : 'REMPLIR VIDES UNIQUEMENT'}`);
  console.log('\n📋 Données reçues:', JSON.stringify(data, null, 2));

  try {
    const setTextField = overwriteExisting ? safeSetTextField : safeSetTextFieldIfEmpty;

    // ========================================
    // SECTION 1 : Identité du demandeur
    // ========================================
    console.log('\n--- SECTION 1 : Demandeur ---');
    
    setTextField(form, 'D1N_nom', data.demandeur.identite.nom || '');
    setTextField(form, 'D1P_prenom', data.demandeur.identite.prenom || '');
    setTextField(form, 'Denomination_sociale', data.demandeur.identite.denominationSociale || '');
    setTextField(form, 'Raison_sociale', data.demandeur.identite.raisonSociale || '');
    setTextField(form, 'Numero_SIRET', data.demandeur.identite.numeroSIRET || '');
    setTextField(form, 'Type_societe', data.demandeur.identite.typeDeSociete || '');
    setTextField(form, 'Nom_representant', data.demandeur.identite.nomRepresentantLegal || '');
    setTextField(form, 'Prenom_representant', data.demandeur.identite.prenomRepresentantLegal || '');

    // ========================================
    // SECTION 2 : Coordonnées
    // ========================================
    console.log('\n--- SECTION 2 : Coordonnées ---');
    
    setTextField(form, 'D3N_numero', data.demandeur.adresse.numero || '');
    setTextField(form, 'D3V_voie', data.demandeur.adresse.voie || '');
    setTextField(form, 'D3L_lieuDit', data.demandeur.adresse.lieuDit || '');
    setTextField(form, 'D3C_code', data.demandeur.adresse.codePostal || '');
    setTextField(form, 'D3L_localite', data.demandeur.adresse.ville || '');
    setTextField(form, 'D3D_boite', data.demandeur.adresse.bP || '');
    setTextField(form, 'D3X_cedex', data.demandeur.adresse.cedex || '');
    
    // 🔴 TÉLÉPHONE - Debug et remplissage
    const telephone = data.demandeur.contact.telephone || '';
    console.log(`\n📞 TÉLÉPHONE DEBUG:`);
    console.log(`  - Valeur brute: "${telephone}"`);
    console.log(`  - Type: ${typeof telephone}`);
    console.log(`  - Longueur: ${telephone.length}`);
    
    // Nettoyer le numéro (retirer espaces, tirets, points)
    const telephoneClean = telephone.replace(/[\s\-\.]/g, '');
    console.log(`  - Valeur nettoyée: "${telephoneClean}"`);
    
    setTextField(form, 'D3T_telephone', telephoneClean);
    setTextField(form, 'D3K_indicatif', data.demandeur.contact.indicatifTel || '');
    
    // 🔴 EMAIL - Découper avant et après @
    const email = data.demandeur.contact.email || '';
    console.log(`\n📧 EMAIL DEBUG:`);
    console.log(`  - Valeur brute: "${email}"`);
    console.log(`  - Type: ${typeof email}`);
    
    if (email && email.includes('@')) {
      const [emailPart1, emailPart2] = email.split('@');
      console.log(`  - Partie 1 (avant @): "${emailPart1}"`);
      console.log(`  - Partie 2 (après @): "${emailPart2}"`);
      
      setTextField(form, 'D5GE1_email', emailPart1);
      setTextField(form, 'D5GE2_email', emailPart2);
    } else {
      console.log(`  ⚠️ Email invalide ou manquant`);
      setTextField(form, 'D5GE1_email', email); // Mettre tout dans le premier champ par défaut
      setTextField(form, 'D5GE2_email', '');
    }
    
    setTextField(form, 'D3P_pays', data.demandeur.adresse.pays || '');
    setTextField(form, 'D3D_division', data.demandeur.adresse.divisionTerritoriale || '');

    // ========================================
    // SECTION 3 : Terrain
    // ========================================
    console.log('\n--- SECTION 3 : Terrain ---');
    
    setTextField(form, 'T2Q_numero', data.terrain.localisation.numero || '');
    setTextField(form, 'T2V_voie', data.terrain.localisation.voie || '');
    setTextField(form, 'T2W_lieudit', data.terrain.localisation.lieuDit || '');
    setTextField(form, 'T2L_localite', data.terrain.localisation.localite || '');
    setTextField(form, 'T2C_code', data.terrain.localisation.codePostal || '');

    // Références cadastrales
    if (data.terrain.referencesCadastrales.section) {
      setTextField(form, 'T2S_section', data.terrain.referencesCadastrales.section[0] || '');
      setTextField(form, 'T2SP2_section', data.terrain.referencesCadastrales.section[1] || '');
      setTextField(form, 'T2SP3_section', data.terrain.referencesCadastrales.section[2] || '');
    }

    if (data.terrain.referencesCadastrales.numeroParcelle) {
      setTextField(form, 'T2N_numero', data.terrain.referencesCadastrales.numeroParcelle[0] || '');
      setTextField(form, 'T2NP2_numero', data.terrain.referencesCadastrales.numeroParcelle[1] || '');
      setTextField(form, 'T2NP3_numero', data.terrain.referencesCadastrales.numeroParcelle[2] || '');
    }

    if (data.terrain.referencesCadastrales.superficie) {
      setTextField(form, 'T2T_superficie', data.terrain.referencesCadastrales.superficie[0] || '');
      setTextField(form, 'T2TP2_superfice', data.terrain.referencesCadastrales.superficie[1] || '');
      setTextField(form, 'T2TP3_superfice', data.terrain.referencesCadastrales.superficie[2] || '');
      
      const total = data.terrain.referencesCadastrales.superficie
        .slice(0, 3)
        .reduce((sum, sup) => sum + (parseFloat(sup) || 0), 0);
      
      setTextField(form, 'D5T_total', total.toString());
    }

    // ========================================
    // SECTION 4 : Projet
    // ========================================
    console.log('\n--- SECTION 4 : Projet ---');
    
    setTextField(form, 'C2ZD1_description', data.projet.caracteristiques.nature || '');

    // ========================================
    // 4.4 Emprise au sol
    // ========================================
    console.log('\n--- 4.4 : Emprise au sol ---');
    
    const empriseAvant = parseFloat(data.projet.surfaces.empriseAvantTravaux || '0');
    const empriseCree = parseFloat(data.projet.surfaces.empriseCree || '0');
    const empriseSupprimee = parseFloat(data.projet.surfaces.empriseSupprimee || '0');

    setTextField(form, 'W3ES1_avanttravaux', empriseAvant.toString());
    setTextField(form, 'W3ES2_creee', empriseCree.toString());
    setTextField(form, 'W3ES3_supprimee', empriseSupprimee.toString());

    // ========================================
    // 4.5 TABLEAU DES SURFACES
    // ========================================
    console.log('\n=== 4.5 : REMPLISSAGE DU TABLEAU DES SURFACES ===');

    if (!data.projet.tableau45.lignes || data.projet.tableau45.lignes.length === 0) {
      console.error('❌ Aucune ligne dans tableau45.lignes');
      throw new Error('Le tableau 4.5 est vide dans les données extraites');
    }

    // Variables pour les totaux de chaque colonne
    let totalA = 0;
    let totalB = 0;
    let totalC = 0;
    let totalD = 0;
    let totalE = 0;
    let totalF = 0;

    data.projet.tableau45.lignes.forEach((ligne, index) => {
      console.log(`\n📍 Ligne ${index + 1}: ${ligne.destination} > ${ligne.sousDestination}`);
      
      const ligneLettre = determinerLettreLigne(ligne.sousDestination);
      console.log(`   → Lettre de ligne: W2${ligneLettre}A-F`);

      const A = parseFloat(ligne.surfaceExistanteA || '0');
      const B = parseFloat(ligne.surfaceCreeeB || '0');
      const C = parseFloat(ligne.surfaceCreeParChangementC || '0');
      const D = parseFloat(ligne.surfaceSupprimeeD || '0');
      const E = parseFloat(ligne.surfaceSupprimeeParChangementE || '0');
      const total = parseFloat(ligne.surfaceTotale || '0');

      // Accumuler les totaux
      totalA += A;
      totalB += B;
      totalC += C;
      totalD += D;
      totalE += E;


      setTextField(form, `W2${ligneLettre}A1`, A > 0 ? A.toString() : '');
      setTextField(form, `W2${ligneLettre}B1`, B > 0 ? B.toString() : '');
      setTextField(form, `W2${ligneLettre}C1`, C > 0 ? C.toString() : '');
      setTextField(form, `W2${ligneLettre}D1`, D > 0 ? D.toString() : '');
      setTextField(form, `W2${ligneLettre}E1`, E > 0 ? E.toString() : '');
      setTextField(form, `W2${ligneLettre}F1`, total > 0 ? total.toString() : '');

      console.log(`   ✓ A=${A} B=${B} C=${C} D=${D} E=${E} Total=${total}`);
    });

    // ========================================
    // TOTAUX DU TABLEAU 4.5
    // ========================================

    totalF = totalA + totalB + totalC - totalD - totalE; // Exemple de calcul pour la colonne F

    console.log('\n=== TOTAUX DU TABLEAU 4.5 ===');
    console.log(`Total colonne A (W2SA1): ${totalA}`);
    console.log(`Total colonne B (W2SB1): ${totalB}`);
    console.log(`Total colonne C (W2SC1): ${totalC}`);
    console.log(`Total colonne D (W2SD1): ${totalD}`);
    console.log(`Total colonne E (W2SE1): ${totalE}`);
    console.log(`Total colonne F (W2SF1): ${totalF}`);

    setTextField(form, 'W2SA1', totalA > 0 ? totalA.toString() : '');
    setTextField(form, 'W2SB1', totalB > 0 ? totalB.toString() : '');
    setTextField(form, 'W2SC1', totalC > 0 ? totalC.toString() : '');
    setTextField(form, 'W2SD1', totalD > 0 ? totalD.toString() : '');
    setTextField(form, 'W2SE1', totalE > 0 ? totalE.toString() : '');
    setTextField(form, 'W2SF1', totalF > 0 ? totalF.toString() : '');

    console.log('\n=== FIN DU REMPLISSAGE ===');

    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
    
  } catch (error) {
    console.error('❌ Erreur lors du remplissage du PDF:', error);
    throw new Error(`Impossible de remplir le CERFA: ${error}`);
  }
}

/**
 * Mapping exact des sous-destinations vers les lettres de ligne du tableau 4.5
 */
function determinerLettreLigne(sousDestination?: string): string {
  if (!sousDestination) return 'L';
  
  const destLower = sousDestination.toLowerCase().trim();
  
  const mapping: { [key: string]: string } = {
    'exploitation agricole': 'A',
    'agricole': 'A',
    'exploitation forestière': 'F',
    'forestière': 'F',
    'forestier': 'F',
    'logement': 'L',
    'hébergement': 'M',
    'artisanat et commerce de détail': 'C',
    'artisanat': 'C',
    'commerce de détail': 'C',
    'restauration': 'R',
    'restaurant': 'R',
    'commerce de gros': 'G',
    'activités de services': 'D',
    'services avec accueil': 'D',
    'cinéma': 'K',
    'hôtels': 'W',
    'hotel': 'W',
    'hébergements touristiques': 'X',
    'hébergement touristique': 'X',
    'locaux et bureaux accueillant du public': 'P',
    'bureaux accueillant du public': 'P',
    'locaux techniques': 'T',
    'enseignement': 'U',
    'santé': 'U',
    'action sociale': 'U',
    'salles d\'art': 'J',
    'spectacles': 'J',
    'équipements sportifs': 'V',
    'sportif': 'V',
    'lieux de culte': 'H',
    'culte': 'H',
    'autres équipements': 'N',
    'industrie': 'I',
    'industriel': 'I',
    'entrepôt': 'E',
    'bureau': 'B',
    'bureaux': 'B',
    'congrès': 'Q',
    'exposition': 'Q',
    'cuisine': 'Y',
    'vente en ligne': 'Y'
  };
  
  for (const [key, value] of Object.entries(mapping)) {
    if (destLower.includes(key)) {
      console.log(`   ✓ Détecté: "${key}" → W2${value}`);
      return value;
    }
  }
  
  console.warn(`   ⚠️ Sous-destination "${sousDestination}" non reconnue, défaut = Logement`);
  return 'L';
}

/**
 * Définir un champ texte (toujours)
 */
function safeSetTextField(form: PDFForm, fieldName: string, value?: string) {
  try {
    const field = form.getTextField(fieldName);
    const oldValue = field.getText?.() ?? '';
    const newValue = value?.toString() ?? '';
    
    field.setText(newValue);

    if (oldValue && oldValue.trim() !== '') {
      console.log(`✓ Écrasé "${fieldName}": "${oldValue}" → "${newValue}"`);
    } else {
      console.log(`✓ Rempli "${fieldName}" = "${newValue}"`);
    }
  } catch (error) {
    console.warn(`⚠ Champ "${fieldName}" introuvable`);
  }
}

/**
 * Définir un champ texte UNIQUEMENT s'il est vide
 */
function safeSetTextFieldIfEmpty(form: PDFForm, fieldName: string, value?: string) {
  try {
    const field = form.getTextField(fieldName);
    const currentValue = field.getText?.() ?? '';
    const newValue = value?.toString() ?? '';

    if (!currentValue || currentValue.trim() === '') {
      field.setText(newValue);
      console.log(`✓ Rempli "${fieldName}" = "${newValue}"`);
    } else {
      console.log(`⊗ Ignoré "${fieldName}" (déjà: "${currentValue}")`);
    }
  } catch (error) {
    console.warn(`⚠ Champ "${fieldName}" introuvable`);
  }
}

/**
 * Helper : Convertir File en ArrayBuffer
 */
export async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Helper : Convertir ArrayBuffer en base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper : Lister tous les champs d'un formulaire PDF
 */
export async function listPdfFields(pdfBuffer: ArrayBuffer): Promise<string[]> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    console.log('\n=== CHAMPS DU PDF ===');
    fields.forEach((field, index) => {
      const name = field.getName();
      const type = field.constructor.name;
      console.log(`${index + 1}. ${name} (${type})`);
    });
    
    return fields.map(f => f.getName());
  } catch (error) {
    console.error('Erreur liste champs:', error);
    return [];
  }
}

/**
 * Diagnostiquer le CERFA
 */
export async function diagnoseCERFA(pdfBuffer: ArrayBuffer): Promise<void> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    console.log('\n🔍 === DIAGNOSTIC COMPLET DU CERFA ===\n');
    console.log(`Total de champs : ${fields.length}\n`);
    
    const textFields: any[] = [];
    const checkBoxes: any[] = [];
    const others: any[] = [];
    
    fields.forEach(field => {
      const name = field.getName();
      const type = field.constructor.name;
      
      if (type === 'PDFTextField') {
        try {
          const value = (field as any).getText?.() || '';
          textFields.push({ name, value, type });
        } catch {
          textFields.push({ name, value: 'N/A', type });
        }
      } else if (type === 'PDFCheckBox') {
        try {
          const checked = (field as any).isChecked?.() || false;
          checkBoxes.push({ name, checked, type });
        } catch {
          checkBoxes.push({ name, checked: false, type });
        }
      } else {
        others.push({ name, type });
      }
    });
    
    if (textFields.length > 0) {
      console.log('📝 CHAMPS TEXTE (' + textFields.length + ') :');
      textFields.forEach((f, i) => {
        console.log(`  ${i + 1}. "${f.name}" = "${f.value}"`);
      });
      console.log('');
    }
    
    if (checkBoxes.length > 0) {
      console.log('☑️  CASES À COCHER (' + checkBoxes.length + ') :');
      checkBoxes.forEach((f, i) => {
        console.log(`  ${i + 1}. "${f.name}" = ${f.checked ? '✓' : '☐'}`);
      });
      console.log('');
    }
    
    if (others.length > 0) {
      console.log('🔧 AUTRES CHAMPS (' + others.length + ') :');
      others.forEach((f, i) => {
        console.log(`  ${i + 1}. "${f.name}" (${f.type})`);
      });
      console.log('');
    }
    
    console.log('✅ Diagnostic terminé\n');
    
  } catch (error) {
    console.error('❌ Erreur lors du diagnostic:', error);
  }
}