import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: "Missing text field" },
        { status: 400 }
      );
    }

    const prompt = `
Analyze the following text from a transcript and classify it into ONE of these categories:

1. "Advertising": Sponsorship reads, promo codes, "subscribe to us" messages.
2. "Smalltalk": Banter about weather, personal lives unrelated to the topic, or greetings/goodbyes.
3. "Substantial": The core interview, questions, answers, and GUEST INTRODUCTIONS.

STRICT RULE:
- If the text introduces a guest (e.g., "We are joined by...", "Our guest is..."), it is ALWAYS "Substantial".

Return ONLY JSON:
{ "subjectMatter": "Advertising" | "Smalltalk" | "Substantial" }

Text to analyze:
"${text.substring(0, 500)}"
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    const result = JSON.parse(completion.choices[0].message.content);

    return NextResponse.json(result);
  } catch (error) {
    console.error("SubjectMatter API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", subjectMatter: "Substantial" }, // Fallback
      { status: 500 }
    );
  }
}