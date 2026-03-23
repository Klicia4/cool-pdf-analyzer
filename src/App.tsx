import React, { useState } from 'react';
import { Upload, FileText, Download, Loader2, CheckCircle, AlertCircle, X, FileCheck } from 'lucide-react';
import { fileToArrayBuffer, arrayBufferToBase64, fillCERFAPDF } from './services/pdfService';
import { extractPCMIData, extractDemandeurData } from './services/geminiService';
import "./App.css"

type Step = 'upload' | 'processing' | 'complete';

interface Notification {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
  file?: string;
}

const PCMIToCERFAConverter: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  
  // Fichiers
  const [pcmiFile, setPcmiFile] = useState<File | null>(null);
  const [demandeurFile, setDemandeurFile] = useState<File | null>(null);
  const [cerfaFile, setCerfaFile] = useState<File | null>(null);
  
  // Données extraite
  const [generatedPdfBytes, setGeneratedPdfBytes] = useState<Uint8Array | null>(null);
  
  // États
  const [isProcessing, setIsProcessing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Gestion des notifications
  const addNotification = (type: 'error' | 'success' | 'info', message: string, file?: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message, file }]);
    
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        removeNotification(id);
      }, 5000);
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Handler pour PCMI
  const handlePcmiSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/pdf') {
        setPcmiFile(file);
        addNotification('success', 'Fichier PCARCHI ajouté', file.name);
      } else {
        addNotification('error', 'Le fichier doit être un PDF', file.name);
      }
    }
  };

  // Handler pour le demandeur
  const handleDemandeurSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (validTypes.includes(file.type)) {
        setDemandeurFile(file);
        addNotification('success', 'Données demandeur ajoutées', file.name);
      } else {
        addNotification('error', 'Format non supporté. Utilisez PDF, JPG, PNG ou WEBP', file.name);
      }
    }
  };

  // Handler pour CERFA
  const handleCerfaSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/pdf') {
        setCerfaFile(file);
        addNotification('success', 'Formulaire CERFA ajouté', file.name);
      } else {
        addNotification('error', 'Le formulaire CERFA doit être un PDF', file.name);
      }
    }
  };

  // Convertir image en base64
  const imageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Traitement complet
  const handleProcess = async () => {
    if (!pcmiFile || !cerfaFile) {
      addNotification('error', 'Veuillez ajouter le fichier PCARCHI et le formulaire CERFA');
      return;
    }

    setIsProcessing(true);
    setCurrentStep('processing');

    try {
      // 1. Extraire données PCMI
      addNotification('info', 'Lecture du fichier PCARCHI...');
      const pcmiArrayBuffer = await fileToArrayBuffer(pcmiFile);
      const pcmiBase64 = arrayBufferToBase64(pcmiArrayBuffer);
      
      const pcmiData = await extractPCMIData(pcmiBase64);
      
      // 2. Extraire données demandeur si fourni
      let finalData = pcmiData;
      
      if (demandeurFile) {
        addNotification('info', 'Lecture des données du demandeur...');
        
        let demandeurBase64: string;
        
        if (demandeurFile.type === 'application/pdf') {
          const demandeurBuffer = await fileToArrayBuffer(demandeurFile);
          demandeurBase64 = arrayBufferToBase64(demandeurBuffer);
        } else {
          demandeurBase64 = await imageToBase64(demandeurFile);
        }
        
        const demandeurData = await extractDemandeurData(demandeurBase64, demandeurFile.type);
        
        finalData = {
          ...pcmiData,
          demandeur: demandeurData.demandeur
        };
      }
      
      // 3. Remplir le CERFA
      addNotification('info', 'Remplissage automatique du formulaire...');
      const cerfaBuffer = await fileToArrayBuffer(cerfaFile);
      const filledPdfBytes = await fillCERFAPDF(cerfaBuffer, finalData, false);
      
      setGeneratedPdfBytes(filledPdfBytes);
      setCurrentStep('complete');
      addNotification('success', 'Formulaire CERFA généré avec succès');
      
    } catch (err: any) {
      console.error('Erreur:', err);
      
      // Identifier quel fichier a causé l'erreur
      let errorFile = 'un des fichiers';
      if (err.message?.includes('PCMI') || err.message?.includes('notice') || err.message?.includes('PCARCHI')) {
        errorFile = pcmiFile?.name || 'Fichier PCARCHI';
      } else if (err.message?.includes('demandeur')) {
        errorFile = demandeurFile?.name || 'Données demandeur';
      } else if (err.message?.includes('CERFA')) {
        errorFile = cerfaFile?.name || 'Formulaire CERFA';
      }
      
      addNotification('error', `Impossible de lire : ${errorFile}`, err.message);
      setCurrentStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  // Télécharger le PDF
  const handleDownload = () => {
    if (!generatedPdfBytes) return;

    try {
      const buffer = generatedPdfBytes.buffer.slice(
        generatedPdfBytes.byteOffset, 
        generatedPdfBytes.byteOffset + generatedPdfBytes.byteLength
      );
      const blob = new Blob([buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `CERFA_13406_rempli_${new Date().getTime()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      addNotification('success', 'CERFA téléchargé');
    } catch (err: any) {
      addNotification('error', 'Erreur lors du téléchargement', err.message);
    }
  };

  // Réinitialiser
  const reset = () => {
    setCurrentStep('upload');
    setPcmiFile(null);
    setDemandeurFile(null);
    setCerfaFile(null);
    setGeneratedPdfBytes(null);
    setNotifications([]);
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col overflow-hidden">
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`flex items-start gap-3 p-3 rounded-lg shadow-lg backdrop-blur-sm animate-slideIn ${
              notification.type === 'error' ? 'bg-red-500 text-white' :
              notification.type === 'success' ? 'bg-green-500 text-white' :
              'bg-blue-500 text-white'
            }`}
          >
            <div className="flex-shrink-0">
              {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
              {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
              {notification.type === 'info' && <Loader2 className="w-5 h-5 animate-spin" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{notification.message}</p>
              {notification.file && (
                <p className="text-xs opacity-90 mt-0.5 truncate">{notification.file}</p>
              )}
            </div>
            {notification.type === 'error' && (
              <button
                onClick={() => removeNotification(notification.id)}
                className="flex-shrink-0 hover:bg-white/20 rounded p-1 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">CERFA Générateur</h1>
            <p className="text-xs text-gray-500">Remplissage automatique</p>
          </div>
        </div>
      </div>

      {/* Contenu Principal */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="h-full max-w-6xl mx-auto">
          
          {/* Étape Upload */}
          {currentStep === 'upload' && (
            <div className="h-full flex flex-col">
              <div className="grid grid-cols-3 gap-4 mb-4">
                {/* Zone 1 : PCARCHI */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">1</span>
                    Fichier PCARCHI
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handlePcmiSelect}
                    className="hidden"
                    id="pcmi-upload"
                  />
                  <label
                    htmlFor="pcmi-upload"
                    className={`flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-all h-32 ${
                      pcmiFile
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    {pcmiFile ? (
                      <>
                        <CheckCircle className="w-8 h-8 text-green-600" />
                        <p className="text-xs font-medium text-gray-900 text-center truncate w-full px-2">{pcmiFile.name}</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-400" />
                        <p className="text-xs font-medium text-gray-700">Sélectionner PDF</p>
                      </>
                    )}
                  </label>
                </div>

                {/* Zone 2 : Formulaire CERFA */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">2</span>
                    Formulaire CERFA
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleCerfaSelect}
                    className="hidden"
                    id="cerfa-upload"
                  />
                  <label
                    htmlFor="cerfa-upload"
                    className={`flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-all h-32 ${
                      cerfaFile
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 hover:border-purple-500 hover:bg-purple-50'
                    }`}
                  >
                    {cerfaFile ? (
                      <>
                        <CheckCircle className="w-8 h-8 text-green-600" />
                        <p className="text-xs font-medium text-gray-900 text-center truncate w-full px-2">{cerfaFile.name}</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-400" />
                        <p className="text-xs font-medium text-gray-700">Sélectionner PDF</p>
                        <p className="text-[10px] text-gray-500">Vide ou pré-rempli</p>
                      </>
                    )}
                  </label>
                </div>

                {/* Zone 3 : Demandeur (optionnel) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 bg-green-100 text-green-700 rounded-full text-xs font-bold">3</span>
                    Demandeur
                    <span className="text-[10px] font-normal text-gray-500">(optionnel)</span>
                  </label>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleDemandeurSelect}
                    className="hidden"
                    id="demandeur-upload"
                  />
                  <label
                    htmlFor="demandeur-upload"
                    className={`flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-all h-32 ${
                      demandeurFile
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 hover:border-green-500 hover:bg-green-50'
                    }`}
                  >
                    {demandeurFile ? (
                      <>
                        <CheckCircle className="w-8 h-8 text-green-600" />
                        <p className="text-xs font-medium text-gray-900 text-center truncate w-full px-2">{demandeurFile.name}</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-400" />
                        <p className="text-xs font-medium text-gray-700">PDF ou Image</p>
                        <p className="text-[10px] text-gray-500">CNI, CERFA page 1...</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Bouton de génération */}
              <button
                onClick={handleProcess}
                disabled={!pcmiFile || !cerfaFile || isProcessing}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
                  pcmiFile && cerfaFile && !isProcessing
                    ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <FileCheck className="inline w-5 h-5 mr-2 mb-0.5" />
                Générer le CERFA automatiquement
              </button>

              {/* Zone d'informations */}
              <div className="flex-1 mt-4 bg-white rounded-lg border border-gray-200 p-6 overflow-y-auto">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Guide d'utilisation</h3>
                <div className="space-y-3 text-sm text-gray-600">
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    <div>
                      <p className="font-medium text-gray-900">Fichier PCARCHI (obligatoire)</p>
                      <p className="text-xs">Document contenant les données du projet : surfaces, terrain, nature des travaux...</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    <div>
                      <p className="font-medium text-gray-900">Formulaire CERFA (obligatoire)</p>
                      <p className="text-xs">Formulaire CERFA vierge ou partiellement rempli que vous souhaitez compléter automatiquement.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    <div>
                      <p className="font-medium text-gray-900">Données demandeur (optionnel)</p>
                      <p className="text-xs">PDF ou image contenant : nom, prénom, adresse du demandeur. Si non fourni, ces données seront extraites du PCARCHI.</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-900">
                    <strong>💡 Astuce :</strong> L'intelligence artificielle analyse automatiquement vos documents et remplit le formulaire CERFA en quelques minutes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Étape Processing */}
          {currentStep === 'processing' && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  Traitement en cours
                </h3>
                <p className="text-sm text-gray-600">
                  Analyse et remplissage automatique du formulaire...
                </p>
              </div>
            </div>
          )}

          {/* Étape Complete */}
          {currentStep === 'complete' && generatedPdfBytes && (
            <div className="h-full flex flex-col">
              {/* Header avec actions */}
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">CERFA généré</h3>
                    <p className="text-xs text-gray-600">Formulaire rempli automatiquement</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleDownload}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-all flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Télécharger
                  </button>
                  <button
                    onClick={reset}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gray-300 transition-all"
                  >
                    Nouveau
                  </button>
                </div>
              </div>

              {/* Aperçu PDF */}
              <div className="flex-1 min-h-0 bg-white rounded-lg border-2 border-gray-200 p-1">
                <iframe
                  src={URL.createObjectURL(
                    new Blob(
                      [generatedPdfBytes.buffer.slice(
                        generatedPdfBytes.byteOffset,
                        generatedPdfBytes.byteOffset + generatedPdfBytes.byteLength
                      ) as ArrayBuffer],
                      { type: "application/pdf" }
                    )
                  )}
                  className="w-full h-full rounded"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PCMIToCERFAConverter;