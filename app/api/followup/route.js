import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { contextTurns, targetTurnID } = await req.json();

    if (!contextTurns || contextTurns.length < 2) {
      return NextResponse.json({ error: "Insufficient context" }, { status: 400 });
    }

    // -----------------------------------------------------
    // PROMPT
    // -----------------------------------------------------
    const prompt = `
You are an interview critic. Evaluate the FINAL TURN in the conversation context below.

CONTEXT:
${JSON.stringify(contextTurns.map(t => ({ role: t.role || "Unknown", text: t.text })), null, 2)}

TASK:
Assess how well the Speaker (in the final turn) answered the question posed in the preceding turns.

RULES:
1. IGNORE ADVERTISEMENTS or PROMOTIONS. (Score as 0, Summation: "N/A - Ad").
2. IGNORE PLEASANTRIES or DISCURSIVE CHAT. (Score as 0, Summation: "N/A - Pleasantry").
3. Determine the actual question from the Context history (it might be 2 turns back).
4. Assign a 'responseScore' (0.0 to 1.0) based on directness and substance.
5. Provide a 'responseSummation' (max 15 words).

<SCHEMA>
{
  "responseSummation": "String",
  "responseScore": Number
}
</SCHEMA>
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

    // Attach ID for client merging
    const finalResponse = {
        ID: targetTurnID,
        ...parsed
    };

    return NextResponse.json(finalResponse, { status: 200 });

  } catch (error) {
    console.error("Server Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}