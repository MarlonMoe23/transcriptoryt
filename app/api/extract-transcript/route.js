import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    console.log('🚀 API funcionando!');
    
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

    // Por ahora devolvemos datos de prueba para verificar que la API funciona
    return NextResponse.json({
      success: true,
      videoInfo: {
        title: "API funcionando correctamente ✅",
        channel: "Sistema de prueba",
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        publishedAt: new Date().toISOString()
      },
      transcription: "Esta es una prueba para verificar que la API está funcionando correctamente. En el siguiente paso integraremos la extracción real de transcripciones.",
      method: "Modo de prueba",
      videoId
    });

  } catch (error) {
    console.error('❌ Error en API:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}

// También agregamos GET para testing
export async function GET() {
  return NextResponse.json({ 
    message: 'API de transcripción funcionando correctamente',
    timestamp: new Date().toISOString()
  });
}