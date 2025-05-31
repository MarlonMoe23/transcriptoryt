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
  
  console.log('🔍 Iniciando getVideoInfo para:', videoId);
  console.log('🔑 API Key configurada:', !!apiKey);
  
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet`;
    console.log('📡 URL de API:', url.replace(apiKey, 'API_KEY_HIDDEN'));
    
    const response = await fetch(url);
    console.log('📊 Status de respuesta:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error de API YouTube:', errorText);
      throw new Error(`Error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('✅ Datos obtenidos:', {
      itemsCount: data.items?.length || 0,
      hasVideo: !!data.items?.[0]
    });
    
    return data.items[0] || null;
  } catch (error) {
    console.error('🚨 Error en getVideoInfo:', error);
    throw error;
  }
}

// Función mejorada para probar youtube-transcript con diagnósticos
async function testYoutubeTranscript(videoId) {
  console.log('🎬 Iniciando prueba de youtube-transcript para:', videoId);
  
  const results = {
    spanish: null,
    english: null,
    any: null,
    errors: []
  };
  
  // Test 1: Intentar en español
  try {
    console.log('🇪🇸 Intentando transcripción en español...');
    const startTime = Date.now();
    
    const transcript = await Promise.race([
      YoutubeTranscript.fetchTranscript(videoId, { lang: 'es' }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout después de 8 segundos')), 8000)
      )
    ]);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Español exitoso en ${duration}ms, items:`, transcript?.length || 0);
    
    if (transcript && transcript.length > 0) {
      results.spanish = {
        success: true,
        items: transcript.length,
        duration: duration,
        sample: transcript.slice(0, 3).map(item => item.text).join(' ')
      };
    }
  } catch (error) {
    console.log('❌ Error en español:', error.message);
    results.errors.push({ lang: 'spanish', error: error.message });
  }
  
  // Test 2: Intentar en inglés
  try {
    console.log('🇺🇸 Intentando transcripción en inglés...');
    const startTime = Date.now();
    
    const transcript = await Promise.race([
      YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout después de 8 segundos')), 8000)
      )
    ]);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Inglés exitoso en ${duration}ms, items:`, transcript?.length || 0);
    
    if (transcript && transcript.length > 0) {
      results.english = {
        success: true,
        items: transcript.length,
        duration: duration,
        sample: transcript.slice(0, 3).map(item => item.text).join(' ')
      };
    }
  } catch (error) {
    console.log('❌ Error en inglés:', error.message);
    results.errors.push({ lang: 'english', error: error.message });
  }
  
  // Test 3: Intentar sin especificar idioma
  if (!results.spanish && !results.english) {
    try {
      console.log('🌐 Intentando transcripción sin idioma específico...');
      const startTime = Date.now();
      
      const transcript = await Promise.race([
        YoutubeTranscript.fetchTranscript(videoId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout después de 8 segundos')), 8000)
        )
      ]);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Sin idioma exitoso en ${duration}ms, items:`, transcript?.length || 0);
      
      if (transcript && transcript.length > 0) {
        results.any = {
          success: true,
          items: transcript.length,
          duration: duration,
          sample: transcript.slice(0, 3).map(item => item.text).join(' ')
        };
      }
    } catch (error) {
      console.log('❌ Error sin idioma:', error.message);
      results.errors.push({ lang: 'any', error: error.message });
    }
  }
  
  return results;
}

export async function POST(request) {
  const startTime = Date.now();
  console.log('🚀 Iniciando diagnóstico completo...');
  
  try {
    const { youtubeUrl } = await request.json();
    
    if (!youtubeUrl) {
      return NextResponse.json(
        { error: 'URL de YouTube requerida' },
        { status: 400 }
      );
    }
    
    console.log('🔗 URL recibida:', youtubeUrl);
    
    // Paso 1: Extraer video ID
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json(
        { error: 'URL de YouTube inválida' },
        { status: 400 }
      );
    }
    console.log('🆔 Video ID extraído:', videoId);
    
    // Paso 2: Obtener info del video (para verificar que existe)
    let videoInfo = null;
    try {
      videoInfo = await getVideoInfo(videoId);
      console.log('📹 Video info obtenida:', !!videoInfo);
    } catch (error) {
      console.log('⚠️ Error obteniendo info del video:', error.message);
      return NextResponse.json({
        error: 'Error obteniendo información del video',
        details: error.message,
        videoId: videoId
      }, { status: 500 });
    }
    
    if (!videoInfo) {
      return NextResponse.json(
        { error: 'Video no encontrado o no es público' },
        { status: 404 }
      );
    }
    
    // Paso 3: Probar youtube-transcript con diagnósticos
    console.log('🎯 Iniciando pruebas de transcripción...');
    const transcriptResults = await testYoutubeTranscript(videoId);
    
    const totalDuration = Date.now() - startTime;
    console.log(`⏱️ Proceso completo terminado en ${totalDuration}ms`);
    
    // Determinar si hay transcripción exitosa
    const hasTranscript = transcriptResults.spanish || transcriptResults.english || transcriptResults.any;
    
    return NextResponse.json({
      success: !!hasTranscript,
      videoId: videoId,
      videoInfo: {
        title: videoInfo.snippet.title,
        channel: videoInfo.snippet.channelTitle,
        thumbnail: videoInfo.snippet.thumbnails?.medium?.url || videoInfo.snippet.thumbnails?.default?.url,
        publishedAt: videoInfo.snippet.publishedAt
      },
      transcriptTests: transcriptResults,
      diagnostics: {
        totalDuration: totalDuration,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          vercel: !!process.env.VERCEL,
          vercelRegion: process.env.VERCEL_REGION || 'unknown'
        }
      },
      // Si hay transcripción, incluirla
      ...(hasTranscript && {
        transcription: (transcriptResults.spanish?.sample || 
                      transcriptResults.english?.sample || 
                      transcriptResults.any?.sample) + '... [muestra de diagnóstico]',
        method: transcriptResults.spanish ? 'Español' : 
                transcriptResults.english ? 'Inglés' : 'Automático'
      })
    });
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('🚨 Error general en diagnóstico:', error);
    
    return NextResponse.json({
      error: 'Error en diagnóstico',
      details: error.message,
      stack: error.stack,
      diagnostics: {
        totalDuration: totalDuration,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          vercel: !!process.env.VERCEL,
          vercelRegion: process.env.VERCEL_REGION || 'unknown'
        }
      }
    }, { status: 500 });
  }
}