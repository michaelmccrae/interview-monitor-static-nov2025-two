import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ isAd: false });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini", // Use your cheapest available model
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an ad detector for podcast transcripts. 
          Analyze the text. If it contains an advertisement, sponsorship read, promo code, or commercial copy, return {"isAd": true}. 
          If it is regular conversation or content, return {"isAd": false}. 
          Return ONLY JSON.`
        },
        { role: "user", content: text }
      ],
      temperature: 0, // Keep it deterministic
    });

    const result = JSON.parse(response.choices[0].message.content);
    return NextResponse.json(result);

  } catch (error) {
    console.error("Ad detection error:", error);
    // Default to false so the main content processor doesn't break
    return NextResponse.json({ isAd: false });
  }
}