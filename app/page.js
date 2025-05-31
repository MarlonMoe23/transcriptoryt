'use client';

import React, { useState } from 'react';
import { Search, Download, Youtube, Clock, User, Calendar, AlertCircle, CheckCircle, Loader } from 'lucide-react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const extractTranscript = async () => {
    if (!url.trim()) {
      setError('Por favor ingresa una URL de YouTube');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/extract-transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ youtubeUrl: url }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Si hay detalles adicionales, los guardamos también
        if (data.details) {
          setResult({ details: data.details });
        }
        throw new Error(data.error || 'Error al procesar el video');
      }

      setResult(data);
    } catch (err) {
      setError(err.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const downloadTranscript = () => {
    if (!result?.transcription) return;

    const content = `Transcripción de: ${result.videoInfo.title}
Canal: ${result.videoInfo.channel}
Método: ${result.method}
Fecha: ${new Date().toLocaleDateString()}

---

${result.transcription}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcripcion-${result.videoId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    if (!result?.transcription) return;
    
    try {
      await navigator.clipboard.writeText(result.transcription);
      alert('Transcripción copiada al portapapeles');
    } catch (err) {
      console.error('Error al copiar al portapapeles:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-500 via-purple-600 to-blue-600">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Youtube className="w-12 h-12 text-white mr-3" />
            <h1 className="text-4xl font-bold text-white">
              YouTube Transcriptor
            </h1>
          </div>
          <p className="text-xl text-white/90">
            Extrae transcripciones y subtítulos de cualquier video de YouTube
          </p>
        </div>

        {/* Main Card */}
        <div className="max-w-4xl mx-auto bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
          {/* Input Section */}
          <div className="mb-8">
            <label className="block text-white text-lg font-semibold mb-3">
              URL del Video de YouTube
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                disabled={loading}
              />
              <button
                onClick={extractTranscript}
                disabled={loading}
                className="px-6 py-3 bg-white text-purple-600 font-semibold rounded-lg hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
              >
                {loading ? (
                  <Loader className="w-5 h-5 animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
                {loading ? 'Procesando...' : 'Extraer'}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle className="w-5 h-5 text-red-300 flex-shrink-0" />
                <p className="text-red-100 font-semibold">Error</p>
              </div>
              <p className="text-red-100 mb-2">{error}</p>
              {result?.details && (
                <div className="text-red-200/80 text-sm">
                  <p className="font-medium mb-1">Posibles causas:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {Array.isArray(result.details) ? 
                      result.details.map((detail, i) => <li key={i}>{detail}</li>) :
                      <li>{result.details}</li>
                    }
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <Loader className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
              <p className="text-white text-lg">Procesando video...</p>
              <p className="text-white/70 text-sm mt-2">
                Esto puede tomar unos momentos dependiendo del video
              </p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-6">
              {/* Success Message */}
              <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-300 flex-shrink-0" />
                <div>
                  <p className="text-green-100 font-semibold">¡Transcripción extraída exitosamente!</p>
                  <p className="text-green-200/80 text-sm">Método: {result.method}</p>
                </div>
              </div>

              {/* Video Info */}
              <div className="bg-white/10 rounded-lg p-6 border border-white/20">
                <div className="flex gap-4">
                  <img 
                    src={result.videoInfo.thumbnail} 
                    alt="Thumbnail"
                    className="w-32 h-24 object-cover rounded-lg"
                  />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2">
                      {result.videoInfo.title}
                    </h3>
                    <div className="flex items-center gap-4 text-white/80 text-sm">
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {result.videoInfo.channel}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(result.videoInfo.publishedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transcription */}
              <div className="bg-white/10 rounded-lg border border-white/20">
                <div className="p-4 border-b border-white/20 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Transcripción
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={copyToClipboard}
                      className="px-3 py-1 bg-blue-500/20 text-blue-200 rounded hover:bg-blue-500/30 transition-colors text-sm"
                    >
                      Copiar
                    </button>
                    <button
                      onClick={downloadTranscript}
                      className="px-3 py-1 bg-green-500/20 text-green-200 rounded hover:bg-green-500/30 transition-colors text-sm flex items-center gap-1"
                    >
                      <Download className="w-4 h-4" />
                      Descargar
                    </button>
                  </div>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto">
                  <p className="text-white/90 leading-relaxed whitespace-pre-wrap">
                    {result.transcription}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="max-w-4xl mx-auto mt-8 bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-3">Instrucciones de uso:</h3>
          <div className="text-white/80 space-y-2 text-sm">
            <p>• Pega cualquier URL de YouTube (formato completo o corto youtu.be)</p>
            <p>• La app intentará extraer subtítulos oficiales primero, luego transcripción automática</p>
            <p>• Funciona con videos en español e inglés principalmente</p>
            <p>• Puedes copiar o descargar la transcripción como archivo de texto</p>
          </div>
        </div>
      </div>
    </div>
  );
}