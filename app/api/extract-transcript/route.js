import { NextResponse } from 'next/server';

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

    // Extraer video ID
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = youtubeUrl.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;
    
    if (!videoId) {
      return NextResponse.json(
        { error: 'URL de YouTube inválida' },
        { status: 400 }
      );
    }

    console.log('🔍 Video ID extraído:', videoId);

    // Obtener información del video
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key de YouTube no configurada' },
        { status: 500 }
      );
    }

    // Obtener info del video
    const videoInfoResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet`,
      {
        headers: {
          'User-Agent': 'YouTube-Transcriptor/1.0'
        }
      }
    );

    if (!videoInfoResponse.ok) {
      return NextResponse.json(
        { error: 'Error al obtener información del video' },
        { status: 404 }
      );
    }

    const videoData = await videoInfoResponse.json();
    const videoInfo = videoData.items[0];

    if (!videoInfo) {
      return NextResponse.json(
        { error: 'Video no encontrado o no es público' },
        { status: 404 }
      );
    }

    console.log('✅ Video encontrado:', videoInfo.snippet.title);

    // Intentar obtener transcripción usando método web directo
    try {
      const transcriptResult = await extractTranscriptFromYoutube(videoId);
      
      if (transcriptResult) {
        console.log('✅ Transcripción extraída exitosamente');
        
        return NextResponse.json({
          success: true,
          videoInfo: {
            title: videoInfo.snippet.title,
            channel: videoInfo.snippet.channelTitle,
            thumbnail: videoInfo.snippet.thumbnails?.medium?.url || 
                      `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            publishedAt: videoInfo.snippet.publishedAt
          },
          transcription: transcriptResult.transcription,
          method: transcriptResult.method,
          videoId
        });
      }
    } catch (transcriptError) {
      console.error('Error extrayendo transcripción:', transcriptError);
    }

    // Si no se pudo obtener transcripción
    console.log('❌ No se pudo obtener transcripción');
    return NextResponse.json({
      error: 'No se encontró transcripción o subtítulos para este video',
      details: [
        'El video no tiene subtítulos automáticos habilitados',
        'El video es muy reciente y YouTube aún no generó los subtítulos',
        'El creador deshabilitó los subtítulos automáticos',
        'El video está en un idioma no soportado'
      ],
      videoInfo: {
        title: videoInfo.snippet.title,
        channel: videoInfo.snippet.channelTitle,
        description: videoInfo.snippet.description?.substring(0, 200) + '...'
      }
    }, { status: 404 });

  } catch (error) {
    console.error('❌ Error en API:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}

// Función para extraer transcripción directamente de YouTube
async function extractTranscriptFromYoutube(videoId) {
  try {
    // Método 1: Usar API pública de subtítulos de YouTube
    const subtitleApiUrl = `https://video.google.com/timedtext?lang=es&v=${videoId}`;
    
    let response = await fetch(subtitleApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      // Intentar en inglés
      const englishUrl = `https://video.google.com/timedtext?lang=en&v=${videoId}`;
      response = await fetch(englishUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
    }

    if (!response.ok) {
      // Intentar sin especificar idioma
      const autoUrl = `https://video.google.com/timedtext?v=${videoId}`;
      response = await fetch(autoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
    }

    if (response.ok) {
      const xmlText = await response.text();
      
      if (xmlText && xmlText.includes('<text')) {
        // Extraer texto de XML
        const textRegex = /<text[^>]*>(.*?)<\/text>/g;
        const texts = [];
        let match;

        while ((match = textRegex.exec(xmlText)) !== null) {
          const text = match[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/<[^>]*>/g, '')
            .trim();

          if (text) {
            texts.push(text);
          }
        }

        if (texts.length > 0) {
          return {
            transcription: texts.join(' '),
            method: 'Subtítulos automáticos de YouTube'
          };
        }
      }
    }

    // Método 2: Intentar con otro endpoint
    const altUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=es&fmt=srv3`;
    
    const altResponse = await fetch(altUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (altResponse.ok) {
      const xmlText = await altResponse.text();
      
      if (xmlText && xmlText.includes('<text')) {
        const textRegex = /<text[^>]*>(.*?)<\/text>/g;
        const texts = [];
        let match;

        while ((match = textRegex.exec(xmlText)) !== null) {
          const text = match[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/<[^>]*>/g, '')
            .trim();

          if (text) {
            texts.push(text);
          }
        }

        if (texts.length > 0) {
          return {
            transcription: texts.join(' '),
            method: 'Subtítulos automáticos (método alternativo)'
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error en extracción:', error);
    return null;
  }
}

// GET para testing
export async function GET() {
  return NextResponse.json({ 
    message: 'API de transcripción funcionando correctamente',
    timestamp: new Date().toISOString()
  });
}