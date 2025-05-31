import { NextResponse } from 'next/server';

// Configuración para Vercel
export const runtime = 'nodejs';
export const maxDuration = 30;

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
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
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

// Función para obtener subtítulos usando YouTube Data API
async function getYouTubeSubtitles(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/captions?videoId=${videoId}&key=${apiKey}&part=snippet`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'YouTube-Transcriptor/1.0'
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log('No se pudieron obtener subtítulos oficiales');
      return null;
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      // Buscar subtítulos en español primero, luego en inglés
      let captionTrack = data.items.find(item => 
        item.snippet.language === 'es' || item.snippet.language === 'es-ES'
      );
      
      if (!captionTrack) {
        captionTrack = data.items.find(item => 
          item.snippet.language === 'en' || item.snippet.language === 'en-US'
        );
      }
      
      if (!captionTrack) {
        captionTrack = data.items[0];
      }
      
      return {
        id: captionTrack.id,
        language: captionTrack.snippet.language,
        trackKind: captionTrack.snippet.trackKind,
        name: captionTrack.snippet.name
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error obteniendo subtítulos:', error);
    return null;
  }
}

// Función alternativa para extraer transcripción usando métodos web
async function getTranscriptAlternative(videoId) {
  try {
    // Intentar obtener la página del video para extraer información de subtítulos
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(videoUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error('No se pudo acceder al video');
    }
    
    const html = await response.text();
    
    // Buscar enlaces de subtítulos en el HTML
    const captionRegex = /"captionTracks":\s*(\[.*?\])/;
    const match = html.match(captionRegex);
    
    if (match) {
      try {
        const captionTracks = JSON.parse(match[1]);
        
        if (captionTracks.length > 0) {
          // Preferir español, luego inglés, luego el primero disponible
          let selectedTrack = captionTracks.find(track => 
            track.languageCode === 'es' || track.languageCode === 'es-ES'
          );
          
          if (!selectedTrack) {
            selectedTrack = captionTracks.find(track => 
              track.languageCode === 'en' || track.languageCode === 'en-US'
            );
          }
          
          if (!selectedTrack) {
            selectedTrack = captionTracks[0];
          }
          
          if (selectedTrack && selectedTrack.baseUrl) {
            // Descargar los subtítulos
            const subtitleResponse = await fetch(selectedTrack.baseUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (subtitleResponse.ok) {
              const subtitleXml = await subtitleResponse.text();
              
              // Extraer texto de los subtítulos XML
              const textRegex = /<text[^>]*>(.*?)<\/text>/g;
              const texts = [];
              let match;
              
              while ((match = textRegex.exec(subtitleXml)) !== null) {
                const text = match[1]
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/<[^>]*>/g, '') // Remover tags HTML
                  .trim();
                
                if (text) {
                  texts.push(text);
                }
              }
              
              if (texts.length > 0) {
                const transcription = texts.join(' ');
                const method = selectedTrack.kind === 'asr' 
                  ? `Subtítulos automáticos (${selectedTrack.languageCode})`
                  : `Subtítulos oficiales (${selectedTrack.languageCode})`;
                
                return { transcription, method };
              }
            }
          }
        }
      } catch (parseError) {
        console.error('Error parseando subtítulos:', parseError);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error en método alternativo:', error);
    return null;
  }
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
    
    // Verificar subtítulos oficiales primero
    console.log('🎯 Verificando subtítulos oficiales...');
    const officialSubtitles = await getYouTubeSubtitles(videoId);
    
    if (officialSubtitles) {
      console.log('📋 Subtítulos oficiales encontrados:', officialSubtitles.language);
    }
    
    // Intentar extraer transcripción usando método alternativo
    console.log('📝 Extrayendo transcripción...');
    const transcriptResult = await getTranscriptAlternative(videoId);
    
    if (!transcriptResult) {
      console.log('❌ No se pudo obtener transcripción');
      return NextResponse.json({
        error: 'No se encontró transcripción o subtítulos para este video',
        details: [
          'El video no tiene subtítulos automáticos habilitados',
          'El video es muy reciente y YouTube aún no generó los subtítulos',
          'El creador deshabilitó los subtítulos automáticos',
          'El video está en un idioma no soportado para transcripción automática',
          'El video puede estar restringido geográficamente'
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