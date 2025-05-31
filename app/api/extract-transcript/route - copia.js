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

// Función para obtener subtítulos usando YouTube Data API
async function getYouTubeSubtitles(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/captions?videoId=${videoId}&key=${apiKey}&part=snippet`
    );
    
    if (!response.ok) {
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
        language: captionTrack.snippet.language,
        trackKind: captionTrack.snippet.trackKind
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error obteniendo subtítulos oficiales:', error);
    return null;
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
    
    // Obtener información del video
    const videoInfo = await getVideoInfo(videoId);
    if (!videoInfo) {
      return NextResponse.json(
        { error: 'Video no encontrado o no es público' },
        { status: 404 }
      );
    }
    
    let transcription = null;
    let method = '';
    
    // Verificar si hay subtítulos oficiales disponibles
    const officialSubtitles = await getYouTubeSubtitles(videoId);
    
    // Intentar obtener transcripción usando youtube-transcript
    try {
      // Primero intentar en español
      let transcript = null;
      
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId, {
          lang: 'es'
        });
        method = 'Transcripción automática (español)';
      } catch (esError) {
        // Si no hay en español, intentar en inglés
        try {
          transcript = await YoutubeTranscript.fetchTranscript(videoId, {
            lang: 'en'
          });
          method = 'Transcripción automática (inglés)';
        } catch (enError) {
          // Intentar sin especificar idioma
          transcript = await YoutubeTranscript.fetchTranscript(videoId);
          method = 'Transcripción automática';
        }
      }
      
      if (transcript && transcript.length > 0) {
        transcription = transcript.map(item => item.text).join(' ');
        
        // Si hay subtítulos oficiales, actualizar el método
        if (officialSubtitles) {
          method = `${officialSubtitles.trackKind === 'standard' ? 'Subtítulos oficiales' : 'Subtítulos automáticos'} (${officialSubtitles.language})`;
        }
      }
    } catch (transcriptError) {
      console.error('Error obteniendo transcripción:', transcriptError);
    }
    
    if (!transcription) {
      return NextResponse.json({
        error: 'No se encontró transcripción o subtítulos para este video',
        videoInfo: {
          title: videoInfo.snippet.title,
          channel: videoInfo.snippet.channelTitle,
          description: videoInfo.snippet.description?.substring(0, 200) + '...'
        }
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      videoInfo: {
        title: videoInfo.snippet.title,
        channel: videoInfo.snippet.channelTitle,
        thumbnail: videoInfo.snippet.thumbnails?.medium?.url || videoInfo.snippet.thumbnails?.default?.url,
        publishedAt: videoInfo.snippet.publishedAt
      },
      transcription,
      method,
      videoId
    });
    
  } catch (error) {
    console.error('Error en API:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}