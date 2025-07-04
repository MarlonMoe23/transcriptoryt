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

// =================== FUNCIÓN DE LIMPIEZA CENTRALIZADA ===================
function cleanTranscriptionText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleanedText = text;

  // 1. Decodificar entidades HTML comunes
  const htmlEntities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&amp;#39;': "'",
    '&#x27;': "'",
    '&amp;#x27;': "'",
    '&#x2F;': '/',
    '&amp;#x2F;': '/',
    '&#x5C;': '\\',
    '&amp;#x5C;': '\\',
    '&nbsp;': ' ',
    '&hellip;': '...',
    '&mdash;': '—',
    '&ndash;': '–',
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"'
  };

  // Aplicar reemplazos de entidades HTML
  Object.entries(htmlEntities).forEach(([entity, replacement]) => {
    const regex = new RegExp(entity, 'gi');
    cleanedText = cleanedText.replace(regex, replacement);
  });

  // 2. Decodificar entidades numéricas HTML (&#123; o &#x1F;)
  cleanedText = cleanedText.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });
  
  cleanedText = cleanedText.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  // 3. Remover tags HTML restantes
  cleanedText = cleanedText.replace(/<[^>]*>/g, '');

  // 4. Normalizar espacios en blanco
  cleanedText = cleanedText
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  // 5. Limpiar caracteres de control problemáticos
  cleanedText = cleanedText.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

  // 6. Normalizar puntuación duplicada
  cleanedText = cleanedText
    .replace(/\.{3,}/g, '...')
    .replace(/\?{2,}/g, '?')
    .replace(/!{2,}/g, '!')
    .replace(/,{2,}/g, ',');

  return cleanedText;
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

// =================== DETECCIÓN INTELIGENTE DE IDIOMA ===================
function getLanguagePriorities(videoInfo) {
  // Detectar idioma del video
  const videoLanguage = videoInfo?.snippet?.defaultLanguage || 
                       videoInfo?.snippet?.defaultAudioLanguage || 
                       null;
  
  const title = videoInfo?.snippet?.title?.toLowerCase() || '';
  const description = videoInfo?.snippet?.description?.toLowerCase() || '';
  
  console.log('🔍 Idioma detectado del video:', videoLanguage);
  console.log('📋 Título:', videoInfo?.snippet?.title?.substring(0, 50) + '...');
  
  // Heurística simple para detectar idioma si no está disponible en metadata
  let detectedLanguage = videoLanguage;
  
  if (!detectedLanguage) {
    // Patrones comunes en español
    const spanishPatterns = [
      /\b(el|la|los|las|un|una|que|de|en|y|a|por|para|con|su|del|al)\b/g,
      /\b(como|muy|más|todo|todos|hace|hacer|tiene|está|esto|esa|ese)\b/g,
      /[ñáéíóúü]/g
    ];
    
    // Patrones comunes en inglés
    const englishPatterns = [
      /\b(the|and|of|to|in|for|is|on|that|by|this|with|from|they|we|at|be|or|an|are|as|at|be|been|for|from|has|he|in|is|it|its|of|on|that|the|to|was|will|with)\b/g,
      /\b(how|what|when|where|why|who|can|could|would|should|will|get|make|take|go|come|see|know|think|say|want|use|work|try|ask|need|feel|become|leave|put|mean|keep|let|begin|seem|help|talk|turn|start|might|move|live|believe|hold|bring|happen|write|provide|sit|stand|lose|pay|meet|include|continue|set|learn|change|lead|understand|watch|follow|stop|create|speak|read|allow|add|spend|grow|open|walk|win|offer|remember|love|consider|appear|buy|wait|serve|die|send|expect|build|stay|fall|cut|reach|kill|remain)\b/g
    ];
    
    const textToAnalyze = (title + ' ' + description).substring(0, 500);
    
    let spanishMatches = 0;
    let englishMatches = 0;
    
    spanishPatterns.forEach(pattern => {
      const matches = textToAnalyze.match(pattern);
      if (matches) spanishMatches += matches.length;
    });
    
    englishPatterns.forEach(pattern => {
      const matches = textToAnalyze.match(pattern);
      if (matches) englishMatches += matches.length;
    });
    
    console.log('📊 Análisis heurístico - Español:', spanishMatches, 'Inglés:', englishMatches);
    
    if (spanishMatches > englishMatches && spanishMatches > 3) {
      detectedLanguage = 'es';
    } else if (englishMatches > spanishMatches && englishMatches > 3) {
      detectedLanguage = 'en';
    } else {
      detectedLanguage = 'unknown';
    }
  }
  
  console.log('🎯 Idioma final detectado:', detectedLanguage);
  
  // Generar prioridades según el idioma detectado
  let languagePriorities;
  
  switch (detectedLanguage) {
    case 'es':
      // Para videos en español: priorizar español, luego auto, luego inglés como último recurso
      languagePriorities = ['es', 'auto', 'en'];
      console.log('🇪🇸 Video en español detectado - Priorizando español');
      break;
      
    case 'en':
      // Para videos en inglés: priorizar inglés, luego auto, NO buscar español
      languagePriorities = ['en', 'auto'];
      console.log('🇺🇸 Video en inglés detectado - NO buscaré en español para mantener calidad');
      break;
      
    default:
      // Para idioma desconocido: auto primero, luego español e inglés
      languagePriorities = ['auto', 'es', 'en'];
      console.log('🌍 Idioma desconocido - Usando auto primero');
      break;
  }
  
  return {
    detectedLanguage,
    priorities: languagePriorities
  };
}

// Método 1: youtube-captions-scraper con prioridades inteligentes
async function getTranscriptWithCaptionsScraper(videoId, languageInfo) {
  if (!getSubtitles) {
    throw new Error('youtube-captions-scraper no disponible');
  }
  
  console.log('🎯 Método 1: youtube-captions-scraper');
  console.log('📋 Prioridades de idioma:', languageInfo.priorities);
  
  for (const lang of languageInfo.priorities) {
    try {
      console.log(`🔄 Probando idioma: ${lang}`);
      
      const captions = await getSubtitles({
        videoID: videoId,
        lang: lang === 'auto' ? undefined : lang
      });
      
      if (captions && captions.length > 0) {
        console.log(`✅ Éxito con ${lang}, items: ${captions.length}`);
        
        const rawTranscription = captions.map(caption => caption.text).join(' ');
        const transcription = cleanTranscriptionText(rawTranscription);
        
        return {
          transcription,
          method: `Subtítulos extraídos (${lang}) - Video ${languageInfo.detectedLanguage}`,
          language: lang,
          itemCount: captions.length,
          videoLanguage: languageInfo.detectedLanguage
        };
      }
    } catch (error) {
      console.log(`❌ Error con idioma ${lang}:`, error.message);
      continue;
    }
  }
  
  throw new Error('No se encontraron subtítulos con youtube-captions-scraper');
}

// Método 2: youtube-transcript con prioridades inteligentes
async function getTranscriptWithYoutubeTranscript(videoId, languageInfo) {
  if (!YoutubeTranscript) {
    throw new Error('youtube-transcript no disponible');
  }
  
  console.log('🎯 Método 2: youtube-transcript con prioridades inteligentes');
  console.log('📋 Prioridades de idioma:', languageInfo.priorities);
  
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
    // Usar las prioridades dinámicas en lugar de lista fija
    const languages = languageInfo.priorities.map(lang => lang === 'auto' ? null : lang);
    
    for (const lang of languages) {
      try {
        console.log(`🔄 Probando idioma: ${lang || 'auto'}`);
        
        const transcript = lang 
          ? await YoutubeTranscript.fetchTranscript(videoId, { lang })
          : await YoutubeTranscript.fetchTranscript(videoId);
        
        if (transcript && transcript.length > 0) {
          console.log(`✅ Éxito con ${lang || 'auto'}, items: ${transcript.length}`);
          
          const rawTranscription = transcript.map(item => item.text).join(' ');
          const transcription = cleanTranscriptionText(rawTranscription);
          
          return {
            transcription,
            method: `Transcripción automática (${lang || 'auto'}) - Video ${languageInfo.detectedLanguage}`,
            language: lang || 'auto',
            itemCount: transcript.length,
            videoLanguage: languageInfo.detectedLanguage
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

// Método 3: Extracción manual del HTML de YouTube (mantiene lógica original)
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
                const rawTranscription = textMatches
                  .map(match => match.replace(/<[^>]*>/g, '').trim())
                  .filter(text => text.length > 0)
                  .join(' ');
                
                const transcription = cleanTranscriptionText(rawTranscription);
                
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
    
    // 🆕 DETECTAR IDIOMA Y GENERAR PRIORIDADES INTELIGENTES
    const languageInfo = getLanguagePriorities(videoInfo);
    
    // Intentar múltiples métodos con prioridades inteligentes
    const methods = [
      (videoId) => getTranscriptWithCaptionsScraper(videoId, languageInfo),
      (videoId) => getTranscriptWithYoutubeTranscript(videoId, languageInfo),
      getTranscriptFromHTML  // Este mantiene su lógica original
    ];
    
    let result = null;
    let lastError = null;
    
    for (const method of methods) {
      try {
        result = await method(videoId);
        if (result && result.transcription) {
          console.log('✅ Método exitoso:', result.method);
          console.log('🧹 Longitud de transcripción limpia:', result.transcription.length, 'caracteres');
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
          detectedLanguage: languageInfo.detectedLanguage
        },
        suggestions: [
          'Este video puede no tener subtítulos habilitados',
          'Prueba con un video de un canal verificado',
          'Verifica que el video tenga el botón CC disponible en YouTube'
        ]
      }, { status: 404 });
    }
    
    console.log('✅ Transcripción extraída y limpiada:', result.transcription.length, 'caracteres');
    
    return NextResponse.json({
      success: true,
      videoInfo: {
        title: videoInfo.snippet.title,
        channel: videoInfo.snippet.channelTitle,
        thumbnail: videoInfo.snippet.thumbnails?.medium?.url || videoInfo.snippet.thumbnails?.default?.url,
        publishedAt: videoInfo.snippet.publishedAt,
        detectedLanguage: languageInfo.detectedLanguage
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