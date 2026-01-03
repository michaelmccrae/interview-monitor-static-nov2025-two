import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const {
      questionText,
      answerText,
      interviewerName,
      guestName,
    } = await req.json();

    if (!answerText) {
      return NextResponse.json(
        { error: "Missing answer text" },
        { status: 400 }
      );
    }

    // UPDATED PROMPT: Schema now uses responseSummation and responseScore
    const prompt = `
You are an expert interviewer. Assess how the Guest answered the Interviewer's question.

Interviewer: ${interviewerName}
Guest: ${guestName}

Interviewer's Question:
"${questionText || "No preceding question found."}"

Guest's Response:
"${answerText}"

Your job:
1. Provide a concise summation of whether the guest addressed the specific points asked.
2. Assign a relevance score (0.0 to 1.0) on how directly they answered.

<SCHEMA>
{
  "responseSummation": "String",
  "responseScore": Number
}
</SCHEMA>

Return ONLY JSON matching the schema above.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return ONLY strict JSON." },
        { role: "user", content: prompt },
      ],
    });

    const parsed = JSON.parse(
      completion.choices[0].message.content
    );

    return NextResponse.json(parsed, { status: 200 });
  } catch (error) {
    console.error("Server Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}