import { NextResponse } from 'next/server';

function extractVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

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

// Función para diagnóstico completo de lo que está devolviendo YouTube
async function diagnosticYouTubeResponse(videoId) {
  console.log('🔍 === DIAGNÓSTICO COMPLETO DE YOUTUBE ===');
  
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      }
    });
    
    console.log('📊 Status de respuesta:', response.status);
    console.log('📋 Headers de respuesta:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      return {
        error: `HTTP ${response.status}`,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      };
    }
    
    const html = await response.text();
    console.log('📄 Longitud del HTML:', html.length);
    
    // Análisis detallado del contenido
    const analysis = {
      htmlLength: html.length,
      containsPlayerResponse: html.includes('playerResponse'),
      containsCaptionTracks: html.includes('captionTracks'),
      containsAutomaticCaptions: html.includes('automaticCaptions'),
      containsTimedText: html.includes('timedtext'),
      containsPlayerCaptionsRenderer: html.includes('playerCaptionsTracklistRenderer'),
      containsSubtitles: html.includes('subtitles'),
      containsCaptions: html.includes('captions'),
      
      // Buscar patrones específicos
      patterns: {}
    };
    
    // Buscar todos los patrones posibles
    const searchPatterns = [
      { name: 'playerResponse', regex: /"playerResponse":\s*"([^"]*)"/ },
      { name: 'captionTracks_direct', regex: /"captionTracks":\s*(\[.*?\])/ },
      { name: 'automaticCaptions', regex: /"automaticCaptions":\s*{[^}]*"[^"]*":\s*(\[.*?\])/ },
      { name: 'playerCaptionsRenderer', regex: /"playerCaptionsTracklistRenderer"[^}]*"captionTracks":\s*(\[.*?\])/ },
      { name: 'timedtext_url', regex: /(https:\/\/www\.youtube\.com\/api\/timedtext[^"'\s]*)/ },
      { name: 'ytInitialPlayerResponse', regex: /ytInitialPlayerResponse\s*=\s*({.*?});/ },
      { name: 'ytInitialData', regex: /ytInitialData\s*=\s*({.*?});/ }
    ];
    
    for (const pattern of searchPatterns) {
      const match = html.match(pattern.regex);
      if (match) {
        analysis.patterns[pattern.name] = {
          found: true,
          matchLength: match[0].length,
          preview: match[0].substring(0, 200) + (match[0].length > 200 ? '...' : '')
        };
        console.log(`🎯 Patrón encontrado - ${pattern.name}:`, analysis.patterns[pattern.name]);
      } else {
        analysis.patterns[pattern.name] = { found: false };
        console.log(`❌ Patrón NO encontrado - ${pattern.name}`);
      }
    }
    
    // Buscar indicaciones de por qué no hay subtítulos
    const errorIndicators = [
      'transcript is disabled',
      'captions are disabled',
      'no captions available',
      'subtitles unavailable',
      'transcript unavailable'
    ];
    
    analysis.errorIndicators = {};
    for (const indicator of errorIndicators) {
      const found = html.toLowerCase().includes(indicator.toLowerCase());
      analysis.errorIndicators[indicator] = found;
      if (found) {
        console.log(`⚠️ Indicador de error encontrado: ${indicator}`);
      }
    }
    
    // Extraer una muestra del HTML para análisis
    const htmlSample = html.substring(0, 5000);
    analysis.htmlSample = htmlSample;
    
    return analysis;
    
  } catch (error) {
    console.log('❌ Error en diagnóstico:', error.message);
    return {
      error: error.message,
      type: 'network_error'
    };
  }
}

// Función para probar con diferentes videos conocidos
async function testWithKnownVideos() {
  console.log('🧪 === PROBANDO CON VIDEOS CONOCIDOS ===');
  
  const knownVideos = [
    { id: 'dQw4w9WgXcQ', name: 'Rick Roll (muy popular)' },
    { id: 'UF8uR6Z6KLc', name: 'Video tech popular' },
    { id: 'jNQXAC9IVRw', name: 'Me at the zoo (primer video YT)' }
  ];
  
  const results = {};
  
  for (const video of knownVideos) {
    console.log(`🔄 Probando ${video.name} (${video.id})...`);
    try {
      const diagnosis = await diagnosticYouTubeResponse(video.id);
      results[video.id] = {
        name: video.name,
        success: !diagnosis.error,
        diagnosis: diagnosis
      };
      console.log(`✅ ${video.name}:`, diagnosis.htmlLength > 0 ? 'HTML obtenido' : 'Falló');
    } catch (error) {
      results[video.id] = {
        name: video.name,
        success: false,
        error: error.message
      };
      console.log(`❌ ${video.name}:`, error.message);
    }
  }
  
  return results;
}

export async function POST(request) {
  console.log('🚀 === DIAGNÓSTICO ULTIMATE INICIADO ===');
  
  try {
    const { youtubeUrl } = await request.json();
    
    if (!youtubeUrl) {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
    }
    
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
    }
    
    console.log('🎬 Video ID objetivo:', videoId);
    
    // Paso 1: Verificar que el video existe
    let videoInfo = null;
    try {
      videoInfo = await getVideoInfo(videoId);
      console.log('✅ Video existe en YouTube API:', !!videoInfo);
    } catch (error) {
      console.log('❌ Error verificando video:', error.message);
      return NextResponse.json({
        error: 'Error verificando video',
        details: error.message
      }, { status: 500 });
    }
    
    // Paso 2: Diagnóstico completo del video objetivo
    console.log('\n📊 === DIAGNÓSTICO DEL VIDEO OBJETIVO ===');
    const targetDiagnosis = await diagnosticYouTubeResponse(videoId);
    
    // Paso 3: Probar con videos conocidos para comparar
    console.log('\n🧪 === COMPARACIÓN CON VIDEOS CONOCIDOS ===');
    const knownVideoTests = await testWithKnownVideos();
    
    // Paso 4: Información del entorno
    const environmentInfo = {
      vercel: !!process.env.VERCEL,
      region: process.env.VERCEL_REGION || 'unknown',
      nodeVersion: process.version,
      platform: process.platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hasApiKey: !!process.env.YOUTUBE_API_KEY,
      timestamp: new Date().toISOString()
    };
    
    console.log('🌍 Información del entorno:', environmentInfo);
    
    // Paso 5: Análisis y recomendaciones
    let recommendations = [];
    let diagnosis = 'unknown';
    
    if (targetDiagnosis.error) {
      diagnosis = 'youtube_blocked';
      recommendations = [
        'YouTube está bloqueando completamente las requests desde Vercel',
        'Usar una API externa de transcripción sería la mejor opción',
        'Considerar usar un proxy o servicio intermediario'
      ];
    } else if (targetDiagnosis.htmlLength < 100000) {
      diagnosis = 'limited_html';
      recommendations = [
        'YouTube devuelve HTML limitado (sin datos de transcripción)',
        'Detecta que viene de un servidor y limita el contenido',
        'Usar youtube-dl o yt-dlp como servicio externo'
      ];
    } else if (!targetDiagnosis.containsPlayerResponse && !targetDiagnosis.containsCaptionTracks) {
      diagnosis = 'no_transcript_data';
      recommendations = [
        'El HTML no contiene datos de transcripción',
        'El video puede no tener subtítulos habilitados',
        'Probar con videos que definitivamente tengan subtítulos'
      ];
    } else {
      diagnosis = 'parsing_issue';
      recommendations = [
        'Los datos están en el HTML pero no se pueden extraer',
        'Problema con los patrones de búsqueda',
        'Necesita un parser más sofisticado'
      ];
    }
    
    return NextResponse.json({
      videoId: videoId,
      videoInfo: videoInfo ? {
        title: videoInfo.snippet.title,
        channel: videoInfo.snippet.channelTitle,
        publishedAt: videoInfo.snippet.publishedAt
      } : null,
      diagnosis: diagnosis,
      targetVideoAnalysis: targetDiagnosis,
      knownVideoTests: knownVideoTests,
      environment: environmentInfo,
      recommendations: recommendations,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('🚨 Error en diagnóstico ultimate:', error);
    return NextResponse.json({
      error: 'Error en diagnóstico',
      details: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    }, { status: 500 });
  }
}