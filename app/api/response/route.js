// /api/followup/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { contextTurns, targetTurnID } = await req.json();

    if (!Array.isArray(contextTurns) || contextTurns.length === 0) {
      return NextResponse.json({ error: "Invalid context payload" }, { status: 400 });
    }

    const lastTurn = contextTurns[contextTurns.length - 1];

    if (lastTurn.ID !== targetTurnID) {
      return NextResponse.json({ error: "ID mismatch" }, { status: 400 });
    }

    const wordCount = lastTurn.text?.trim().split(/\s+/).length || 0;
    if (wordCount < 10) {
      return NextResponse.json(createNullResponse(targetTurnID, lastTurn.speaker));
    }

    const prompt = `
You are an expert interview analyst.

You are given a short conversation context.
The FINAL turn is the Target Turn.

Your task:
Decide whether the Target Turn merits follow-up questions.
If so, generate 2–3 probing follow-up questions.

DO NOT generate follow-ups if:
- The turn is an advertisement or promotion
- The turn is pleasantry or filler
- The turn is too vague or short
- The turn adds no new information

If follow-ups are inappropriate, return null.

CONTEXT:
${JSON.stringify(
  contextTurns.map(t => ({
    speaker: t.speaker,
    text: t.text
  })),
  null,
  2
)}

<JSON SCHEMA>
{
  "isSubstantive": Boolean,
  "reasoning": "Short explanation",
  "followupQuestion": ["String"] OR null,
  "followupConfidence": [Number] OR null
}
</JSON SCHEMA>
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return ONLY strict JSON." },
        { role: "user", content: prompt },
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content);

    if (!parsed.isSubstantive || !parsed.followupQuestion) {
      return NextResponse.json(createNullResponse(targetTurnID, lastTurn.speaker));
    }

    return NextResponse.json(
      {
        ID: targetTurnID,
        speaker: lastTurn.speaker,
        followupQuestion: parsed.followupQuestion,
        followupConfidence: parsed.followupConfidence || [],
        followupQuestionTimestamp: new Date().toISOString(),
      },
      { status: 200 }
    );

  } catch (err) {
    console.error("🚨 /api/followup error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function createNullResponse(id, speaker) {
  return {
    ID: id,
    speaker,
    followupQuestion: null,
    followupConfidence: null,
    followupQuestionTimestamp: new Date().toISOString(),
  };
}
