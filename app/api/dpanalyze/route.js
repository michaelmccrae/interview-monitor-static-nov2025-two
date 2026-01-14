import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    // 1. Check for content type
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.startsWith('audio/')) {
      return NextResponse.json({ error: 'Invalid content type. Please upload an audio file.' }, { status: 400 });
    }

    // 2. Stream the raw body directly to Deepgram
    // We pass req.body (ReadableStream) directly. 
    // 'duplex: "half"' is often required for streaming bodies in Node.js fetch.
    const deepgramUrl = 'https://api.deepgram.com/v1/listen?model=nova-2&diarize=true&smart_format=true';
    
    const response = await fetch(deepgramUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': contentType, // Pass the original mime type (e.g. audio/mpeg)
      },
      body: req.body, 
      duplex: 'half', 
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Analysis Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}