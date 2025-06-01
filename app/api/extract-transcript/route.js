import { NextResponse } from 'next/server';

// Importar ambas librerías para máxima compatibilidad
let YoutubeTranscript;
let getSubtitles;

try {
  // Importación dinámica para evitar errores si no están instaladas
  YoutubeTranscript = (await import('youtube-transcript')).YoutubeTranscript;
} catch (e) {
  console.log('youtube-transcript no disponible');
}

try {
  getSubtitles = (await import('youtube-captions-scraper')).getSubtitles;
} catch (e) {
  console.log('youtube-captions-scraper no disponible');
}

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

// Método 1: youtube-captions-scraper (Más confiable)
async function getTranscriptWithCaptionsScraper(videoId) {
  if (!getSubtitles) {
    throw new Error('youtube-captions-scraper no disponible');
  }
  
  console.log('🎯 Método 1: youtube-captions-scraper');
  
  const languages = ['es', 'en', 'auto'];
  
  for (const lang of languages) {
    try {
      console.log(`🔄 Probando idioma: ${lang}`);
      
      const captions = await getSubtitles({
        videoID: videoId,
        lang: lang === 'auto' ? undefined : lang
      });
      
      if (captions && captions.length > 0) {
        console.log(`✅ Éxito con ${lang}, items: ${captions.length}`);
        
        const transcription = captions.map(caption => caption.text).join(' ');
        
        return {
          transcription,
          method: `Subtítulos extraídos (${lang})`,
          language: lang,
          itemCount: captions.length
        };
      }
    } catch (error) {
      console.log(`❌ Error con idioma ${lang}:`, error.message);
      continue;
    }
  }
  
  throw new Error('No se encontraron subtítulos con youtube-captions-scraper');
}

// Método 2: youtube-transcript con headers mejorados
async function getTranscriptWithYoutubeTranscript(videoId) {
  if (!YoutubeTranscript) {
    throw new Error('youtube-transcript no disponible');
  }
  
  console.log('🎯 Método 2: youtube-transcript mejorado');
  
  // Interceptar fetch para agregar headers
  const originalFetch = global.fetch;
  
  global.fetch = (url, options = {}) => {
    return originalFetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        ...options.headers,
      },
    });
  };
  
  try {
    const languages = ['es', 'en', null];
    
    for (const lang of languages) {
      try {
        console.log(`🔄 Probando idioma: ${lang || 'auto'}`);
        
        const transcript = lang 
          ? await YoutubeTranscript.fetchTranscript(videoId, { lang })
          : await YoutubeTranscript.fetchTranscript(videoId);
        
        if (transcript && transcript.length > 0) {
          console.log(`✅ Éxito con ${lang || 'auto'}, items: ${transcript.length}`);
          
          const transcription = transcript.map(item => item.text).join(' ');
          
          return {
            transcription,
            method: `Transcripción automática (${lang || 'auto'})`,
            language: lang || 'auto',
            itemCount: transcript.length
          };
        }
      } catch (error) {
        console.log(`❌ Error con idioma ${lang || 'auto'}:`, error.message);
        continue;
      }
    }
    
    throw new Error('No se encontró transcripción con youtube-transcript');
    
  } finally {
    global.fetch = originalFetch;
  }
}

// Método 3: Extracción manual del HTML de YouTube
async function getTranscriptFromHTML(videoId) {
  console.log('🎯 Método 3: Extracción manual de HTML');
  
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
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
    console.log('📄 HTML obtenido:', html.length, 'caracteres');
    
    // Buscar patrones de subtítulos en el HTML
    const patterns = [
      /"captionTracks":\s*(\[.*?\])/,
      /"automaticCaptions":\s*{[^}]*"[^"]*":\s*(\[.*?\])/,
      /"playerCaptionsTracklistRenderer".*?"captionTracks":\s*(\[.*?\])/
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          const captionTracks = JSON.parse(match[1]);
          console.log('🎯 Encontrados caption tracks:', captionTracks.length);
          
          if (captionTracks.length > 0) {
            // Seleccionar el mejor track (español > inglés > primero disponible)
            let selectedTrack = captionTracks.find(track => 
              track.languageCode === 'es' || track.name?.simpleText?.includes('Español')
            ) || captionTracks.find(track => 
              track.languageCode === 'en' || track.name?.simpleText?.includes('English')
            ) || captionTracks[0];
            
            if (selectedTrack && selectedTrack.baseUrl) {
              console.log('📥 Descargando subtítulos de:', selectedTrack.baseUrl);
              
              const captionResponse = await fetch(selectedTrack.baseUrl);
              const captionXML = await captionResponse.text();
              
              // Parsear XML y extraer texto
              const textMatches = captionXML.match(/<text[^>]*>(.*?)<\/text>/g);
              if (textMatches) {
                const transcription = textMatches
                  .map(match => match.replace(/<[^>]*>/g, '').trim())
                  .filter(text => text.length > 0)
                  .join(' ');
                
                if (transcription.length > 0) {
                  return {
                    transcription,
                    method: `Subtítulos manuales (${selectedTrack.languageCode || 'unknown'})`,
                    language: selectedTrack.languageCode || 'unknown',
                    itemCount: textMatches.length
                  };
                }
              }
            }
          }
        } catch (parseError) {
          console.log('❌ Error parseando caption tracks:', parseError.message);
          continue;
        }
      }
    }
    
    throw new Error('No se encontraron subtítulos en el HTML');
    
  } catch (error) {
    console.log('❌ Error en extracción manual:', error.message);
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
    
    // Intentar múltiples métodos en orden de preferencia
    const methods = [
      getTranscriptWithCaptionsScraper,
      getTranscriptWithYoutubeTranscript,
      getTranscriptFromHTML
    ];
    
    let result = null;
    let lastError = null;
    
    for (const method of methods) {
      try {
        result = await method(videoId);
        if (result && result.transcription) {
          console.log('✅ Método exitoso:', result.method);
          break;
        }
      } catch (error) {
        console.log('❌ Método falló:', error.message);
        lastError = error.message;
        continue;
      }
    }
    
    if (!result || !result.transcription) {
      return NextResponse.json({
        error: 'No se pudo extraer la transcripción con ningún método',
        details: lastError,
        videoInfo: {
          title: videoInfo.snippet.title,
          channel: videoInfo.snippet.channelTitle,
          description: videoInfo.snippet.description?.substring(0, 200) + '...',
        },
        suggestions: [
          'Este video puede no tener subtítulos habilitados',
          'Prueba con un video de un canal verificado',
          'Verifica que el video tenga el botón CC disponible en YouTube'
        ]
      }, { status: 404 });
    }
    
    console.log('✅ Transcripción extraída:', result.transcription.length, 'caracteres');
    
    return NextResponse.json({
      success: true,
      videoInfo: {
        title: videoInfo.snippet.title,
        channel: videoInfo.snippet.channelTitle,
        thumbnail: videoInfo.snippet.thumbnails?.medium?.url || videoInfo.snippet.thumbnails?.default?.url,
        publishedAt: videoInfo.snippet.publishedAt
      },
      transcription: result.transcription,
      method: result.method,
      videoId,
      language: result.language,
      itemCount: result.itemCount
    });
    
  } catch (error) {
    console.error('🚨 Error general:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}