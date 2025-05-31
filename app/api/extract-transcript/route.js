import { NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

// Función para extraer video ID del URL de YouTube
function extractVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Función para obtener información del video usando YouTube Data API
async function getVideoInfo(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet`
    );
    
    if (!response.ok) {
      throw new Error('Error al consultar la API de YouTube');
    }
    
    const data = await response.json();
    return data.items[0] || null;
  } catch (error) {
    console.error('Error obteniendo info del video:', error);
    throw new Error('Error al obtener información del video');
  }
}

// Función mejorada para obtener transcript con user-agent específico
async function getTranscriptWithBrowserUserAgent(videoId) {
  console.log('🎭 Intentando con user-agent de navegador...');
  
  // Configurar headers que simulan un navegador real
  const originalFetch = global.fetch;
  
  global.fetch = (url, options = {}) => {
    return originalFetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        ...options.headers,
      },
    });
  };
  
  try {
    // Intentar con diferentes idiomas
    const languages = ['es', 'en', null];
    
    for (const lang of languages) {
      try {
        console.log(`🔄 Probando idioma: ${lang || 'auto'}`);
        
        const transcript = lang 
          ? await YoutubeTranscript.fetchTranscript(videoId, { lang })
          : await YoutubeTranscript.fetchTranscript(videoId);
        
        if (transcript && transcript.length > 0) {
          console.log(`✅ Éxito con idioma: ${lang || 'auto'}, items: ${transcript.length}`);
          return {
            transcript,
            language: lang || 'auto',
            method: lang ? `Transcripción (${lang})` : 'Transcripción automática'
          };
        }
      } catch (langError) {
        console.log(`❌ Error con idioma ${lang || 'auto'}:`, langError.message);
        continue;
      }
    }
    
    throw new Error('No se encontró transcripción en ningún idioma');
    
  } finally {
    // Restaurar fetch original
    global.fetch = originalFetch;
  }
}

// Función alternativa usando puppeteer-like approach (fallback)
async function getTranscriptAlternative(videoId) {
  console.log('🔄 Método alternativo...');
  
  try {
    // Hacer request directo con headers de navegador
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    console.log('📄 HTML obtenido, longitud:', html.length);
    
    // Buscar patrones de transcripción en el HTML
    const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (captionTracksMatch) {
      console.log('🎯 Encontrados captionTracks en HTML');
      // Aquí podrías parsear manualmente los caption tracks
      // Por ahora, dejamos que youtube-transcript maneje esto
    }
    
    // Intentar youtube-transcript después de "calentar" la sesión
    return await getTranscriptWithBrowserUserAgent(videoId);
    
  } catch (error) {
    console.log('❌ Método alternativo falló:', error.message);
    throw error;
  }
}

export async function POST(request) {
  try {
    const { youtubeUrl } = await request.json();
    
    if (!youtubeUrl) {
      return NextResponse.json(
        { error: 'URL de YouTube requerida' },
        { status: 400 }
      );
    }
    
    // Extraer video ID
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json(
        { error: 'URL de YouTube inválida' },
        { status: 400 }
      );
    }
    
    console.log('🎬 Procesando video:', videoId);
    
    // Obtener información del video
    const videoInfo = await getVideoInfo(videoId);
    if (!videoInfo) {
      return NextResponse.json(
        { error: 'Video no encontrado o no es público' },
        { status: 404 }
      );
    }
    
    console.log('✅ Video encontrado:', videoInfo.snippet.title);
    
    let transcriptionResult = null;
    let error = null;
    
    // Método 1: Transcript con user-agent mejorado
    try {
      console.log('🔄 Método 1: User-agent mejorado...');
      transcriptionResult = await getTranscriptWithBrowserUserAgent(videoId);
    } catch (firstError) {
      console.log('❌ Método 1 falló:', firstError.message);
      error = firstError.message;
      
      // Método 2: Alternativo
      try {
        console.log('🔄 Método 2: Alternativo...');
        transcriptionResult = await getTranscriptAlternative(videoId);
      } catch (secondError) {
        console.log('❌ Método 2 falló:', secondError.message);
        error = secondError.message;
      }
    }
    
    if (!transcriptionResult) {
      return NextResponse.json({
        error: 'No se pudo extraer la transcripción',
        details: error,
        videoInfo: {
          title: videoInfo.snippet.title,
          channel: videoInfo.snippet.channelTitle,
          description: videoInfo.snippet.description?.substring(0, 200) + '...',
        },
        suggestions: [
          'Este video puede no tener transcripción habilitada',
          'Prueba con un video diferente',
          'Verifica que el video tenga subtítulos (botón CC en YouTube)'
        ]
      }, { status: 404 });
    }
    
    // Procesar transcripción
    const transcription = transcriptionResult.transcript
      .map(item => item.text)
      .join(' ');
    
    console.log('✅ Transcripción extraída:', transcription.length, 'caracteres');
    
    return NextResponse.json({
      success: true,
      videoInfo: {
        title: videoInfo.snippet.title,
        channel: videoInfo.snippet.channelTitle,
        thumbnail: videoInfo.snippet.thumbnails?.medium?.url || videoInfo.snippet.thumbnails?.default?.url,
        publishedAt: videoInfo.snippet.publishedAt
      },
      transcription,
      method: transcriptionResult.method,
      videoId,
      language: transcriptionResult.language
    });
    
  } catch (error) {
    console.error('🚨 Error general:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}