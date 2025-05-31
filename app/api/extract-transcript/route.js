import { NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

// Configuración para Vercel
export const runtime = 'nodejs';
export const maxDuration = 30; // Máximo 30 segundos

// Función para extraer video ID del URL de YouTube
function extractVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Función para obtener información del video usando YouTube Data API
async function getVideoInfo(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    throw new Error('API Key de YouTube no configurada');
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'YouTube-Transcriptor/1.0'
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('YouTube API Error:', response.status, errorText);
      throw new Error(`YouTube API Error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.items[0] || null;
  } catch (error) {
    console.error('Error obteniendo info del video:', error);
    if (error.name === 'AbortError') {
      throw new Error('Timeout al consultar YouTube API');
    }
    throw error;
  }
}

// Función mejorada para obtener transcripción
async function getTranscriptWithRetry(videoId, maxRetries = 3) {
  const languages = ['es', 'en', 'auto'];
  
  for (const lang of languages) {
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        console.log(`Intentando transcripción: idioma=${lang}, intento=${retry + 1}`);
        
        const options = lang === 'auto' ? {} : { lang };
        const transcript = await YoutubeTranscript.fetchTranscript(videoId, options);
        
        if (transcript && transcript.length > 0) {
          const transcription = transcript.map(item => item.text).join(' ');
          const method = lang === 'auto' 
            ? 'Transcripción automática' 
            : `Transcripción automática (${lang})`;
            
          return { transcription, method };
        }
      } catch (error) {
        console.log(`Error en intento ${retry + 1} con idioma ${lang}:`, error.message);
        
        // Si es el último intento con el último idioma, esperar un poco antes del siguiente
        if (retry < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
        }
      }
    }
  }
  
  return null;
}

export async function POST(request) {
  try {
    console.log('🚀 Iniciando extracción de transcripción...');
    
    const { youtubeUrl } = await request.json();
    
    if (!youtubeUrl) {
      return NextResponse.json(
        { error: 'URL de YouTube requerida' },
        { status: 400 }
      );
    }
    
    console.log('📹 URL recibida:', youtubeUrl);
    
    // Extraer video ID
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json(
        { error: 'URL de YouTube inválida' },
        { status: 400 }
      );
    }
    
    console.log('🔍 Video ID extraído:', videoId);
    
    // Obtener información del video
    console.log('📊 Obteniendo información del video...');
    const videoInfo = await getVideoInfo(videoId);
    
    if (!videoInfo) {
      return NextResponse.json(
        { error: 'Video no encontrado o no es público' },
        { status: 404 }
      );
    }
    
    console.log('✅ Video encontrado:', videoInfo.snippet.title);
    
    // Intentar obtener transcripción
    console.log('📝 Extrayendo transcripción...');
    const transcriptResult = await getTranscriptWithRetry(videoId);
    
    if (!transcriptResult) {
      console.log('❌ No se pudo obtener transcripción');
      return NextResponse.json({
        error: 'No se encontró transcripción o subtítulos para este video. Esto puede pasar si:',
        details: [
          'El video no tiene subtítulos automáticos habilitados',
          'El video es muy reciente y YouTube aún no generó los subtítulos',
          'El creador deshabilitó los subtítulos automáticos',
          'El video está en un idioma no soportado para transcripción automática'
        ],
        videoInfo: {
          title: videoInfo.snippet.title,
          channel: videoInfo.snippet.channelTitle,
          description: videoInfo.snippet.description?.substring(0, 200) + '...'
        }
      }, { status: 404 });
    }
    
    console.log('✅ Transcripción extraída exitosamente');
    
    return NextResponse.json({
      success: true,
      videoInfo: {
        title: videoInfo.snippet.title,
        channel: videoInfo.snippet.channelTitle,
        thumbnail: videoInfo.snippet.thumbnails?.medium?.url || 
                  videoInfo.snippet.thumbnails?.default?.url ||
                  `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        publishedAt: videoInfo.snippet.publishedAt
      },
      transcription: transcriptResult.transcription,
      method: transcriptResult.method,
      videoId
    });
    
  } catch (error) {
    console.error('❌ Error en API:', error);
    
    // Errores específicos más informativos
    if (error.message.includes('API Key')) {
      return NextResponse.json({
        error: 'Error de configuración: API Key de YouTube no válida',
        details: 'Contacta al administrador para verificar la configuración'
      }, { status: 500 });
    }
    
    if (error.message.includes('Timeout')) {
      return NextResponse.json({
        error: 'Tiempo de espera agotado',
        details: 'El servidor tardó demasiado en responder. Intenta de nuevo.'
      }, { status: 408 });
    }
    
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}