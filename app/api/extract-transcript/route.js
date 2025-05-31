import { NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

function extractVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Función para hacer un request HTTP directo y ver qué responde YouTube
async function testDirectYouTubeRequest(videoId) {
  console.log('🔍 Probando request directo a YouTube...');
  
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log('📡 Fetching:', url);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    
    console.log('📊 YouTube response status:', response.status);
    console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.status === 200) {
      const html = await response.text();
      console.log('📄 HTML length:', html.length);
      
      // Buscar indicadores de transcripción en el HTML
      const hasTranscriptButton = html.includes('"showTranscriptCommand"') || 
                                  html.includes('transcript') || 
                                  html.includes('"trackKind":"asr"') ||
                                  html.includes('"trackKind":"standard"');
      
      console.log('🎯 HTML contiene indicadores de transcript:', hasTranscriptButton);
      
      // Buscar patrones específicos
      const transcriptPatterns = [
        'captionTracks',
        'automaticCaptions', 
        'timedtext',
        'playerCaptionsTracklistRenderer'
      ];
      
      transcriptPatterns.forEach(pattern => {
        const found = html.includes(pattern);
        console.log(`🔍 Patrón "${pattern}":`, found);
      });
      
      return {
        status: response.status,
        htmlLength: html.length,
        hasTranscriptIndicators: hasTranscriptButton,
        patterns: transcriptPatterns.reduce((acc, pattern) => {
          acc[pattern] = html.includes(pattern);
          return acc;
        }, {})
      };
    }
    
    return { status: response.status, error: 'Non-200 response' };
    
  } catch (error) {
    console.log('❌ Error en request directo:', error.message);
    return { error: error.message };
  }
}

// Función para probar diferentes user agents
async function testWithDifferentUserAgents(videoId) {
  console.log('🎭 Probando diferentes User Agents...');
  
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'youtube-transcript-api',
    ''  // Sin user agent
  ];
  
  const results = {};
  
  for (let i = 0; i < userAgents.length; i++) {
    const ua = userAgents[i];
    const name = ua ? `UA${i + 1}` : 'NoUA';
    
    try {
      console.log(`🔄 Probando ${name}:`, ua.substring(0, 50) + '...');
      
      // Simular lo que hace youtube-transcript internamente
      const startTime = Date.now();
      
      const transcript = await Promise.race([
        YoutubeTranscript.fetchTranscript(videoId, { lang: 'es' }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout 10s')), 10000)
        )
      ]);
      
      const duration = Date.now() - startTime;
      
      results[name] = {
        success: true,
        duration: duration,
        itemsCount: transcript?.length || 0
      };
      
      console.log(`✅ ${name} exitoso:`, results[name]);
      break; // Si uno funciona, no necesitamos probar los demás
      
    } catch (error) {
      results[name] = {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
      console.log(`❌ ${name} falló:`, error.message);
    }
  }
  
  return results;
}

export async function POST(request) {
  console.log('🚀 Iniciando diagnóstico PROFUNDO...');
  console.log('🌍 Entorno:', {
    vercel: !!process.env.VERCEL,
    region: process.env.VERCEL_REGION,
    nodeVersion: process.version,
    platform: process.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  
  try {
    const { youtubeUrl } = await request.json();
    
    if (!youtubeUrl) {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
    }
    
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
    }
    
    console.log('🎬 Video ID:', videoId);
    
    // Test 1: Request directo a YouTube
    console.log('\n📡 === TEST 1: REQUEST DIRECTO ===');
    const directTest = await testDirectYouTubeRequest(videoId);
    
    // Test 2: Prueba simple de youtube-transcript
    console.log('\n🎯 === TEST 2: YOUTUBE-TRANSCRIPT SIMPLE ===');
    let simpleTranscriptResult = null;
    try {
      const startTime = Date.now();
      const transcript = await Promise.race([
        YoutubeTranscript.fetchTranscript(videoId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout 15s')), 15000)
        )
      ]);
      
      simpleTranscriptResult = {
        success: true,
        duration: Date.now() - startTime,
        itemsCount: transcript?.length || 0,
        sampleText: transcript?.slice(0, 2).map(item => item.text).join(' ')
      };
      console.log('✅ Transcript simple exitoso:', simpleTranscriptResult);
    } catch (error) {
      simpleTranscriptResult = {
        success: false,
        error: error.message
      };
      console.log('❌ Transcript simple falló:', error.message);
    }
    
    // Test 3: Diferentes configuraciones
    console.log('\n🎭 === TEST 3: DIFERENTES CONFIGURACIONES ===');
    const configTests = await testWithDifferentUserAgents(videoId);
    
    // Test 4: Variables de entorno y limitaciones
    console.log('\n⚙️ === TEST 4: ENTORNO ===');
    const envTest = {
      hasApiKey: !!process.env.YOUTUBE_API_KEY,
      vercelFunction: !!process.env.VERCEL,
      memoryLimit: process.env.VERCEL_MEMORY_LIMIT || 'unknown',
      timeout: process.env.VERCEL_TIMEOUT || 'unknown',
      region: process.env.VERCEL_REGION || 'unknown'
    };
    
    return NextResponse.json({
      success: simpleTranscriptResult?.success || false,
      videoId: videoId,
      diagnostics: {
        environment: envTest,
        directYouTubeTest: directTest,
        simpleTranscript: simpleTranscriptResult,
        userAgentTests: configTests,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('🚨 Error general:', error);
    return NextResponse.json({
      error: 'Error en diagnóstico',
      details: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    }, { status: 500 });
  }
}