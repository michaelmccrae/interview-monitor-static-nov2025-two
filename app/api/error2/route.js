import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 Starting /api/error2 POST handler...");

  try {
    const body = await req.json();

    let contextTurns = [];
    let targetTurn = null;
    let marketContext = null;

    // --------------------------------------------------
    // ✅ NEW PAYLOAD HANDLING
    // --------------------------------------------------

    // Case 1: NEW format from LLMProcessor
    // { turns: [...], marketContext }
    if (body && Array.isArray(body.turns)) {
      if (body.turns.length === 0) {
        return NextResponse.json(
          { error: "Empty turns array" },
          { status: 400 }
        );
      }

      contextTurns = body.turns.slice(0, body.turns.length - 1);
      targetTurn = body.turns[body.turns.length - 1];
      marketContext = body.marketContext || null;
    }

    // Case 2: Legacy array payload
    else if (Array.isArray(body)) {
      if (body.length === 0) {
        return NextResponse.json(
          { error: "Empty array payload" },
          { status: 400 }
        );
      }

      contextTurns = body.slice(0, body.length - 1);
      targetTurn = body[body.length - 1];
    }

    // Case 3: Legacy single turn
    else if (body && typeof body === "object") {
      targetTurn = body;
    }

    // --------------------------------------------------
    // VALIDATION
    // --------------------------------------------------

    if (!targetTurn || typeof targetTurn !== "object") {
      return NextResponse.json(
        { error: "Invalid payload: could not resolve target turn" },
        { status: 400 }
      );
    }

    if (typeof targetTurn.text !== "string" || targetTurn.text.trim() === "") {
      return NextResponse.json(
        { error: "Missing 'text' field in target turn" },
        { status: 400 }
      );
    }

    const turnID = targetTurn.ID;
    console.log(
      `🔍 Processing Turn ID: ${turnID} (Context: ${contextTurns.length})`
    );

    // --------------------------------------------------
    // PROMPT
    // --------------------------------------------------

    const prompt = `
You are a professional factual-error analyst with strict citation standards.

INSTRUCTIONS:
1. Analyze ONLY the TARGET TURN below for verifiable factual inaccuracies.
2. Use CONTEXT TURNS only for understanding references and pronouns.
3. You MUST provide a citation (URL or authoritative source) for every error.
4. If an error cannot be proven with a citation, DO NOT report it.
5. If no verifiable errors exist, return ALL fields as null.

STRICT RULES:
- Ignore opinions, tone, grammar, and style.
- Do NOT rewrite text.
- Output ONLY strict JSON.

<SCHEMA>
{
  "speaker": "0",
  "errorMatch": ["string"],
  "errorExplanation": ["string with citation"],
  "errorConfidence": [0.0]
}
</SCHEMA>

<MARKET CONTEXT>
${marketContext ? JSON.stringify(marketContext, null, 2) : "null"}
</MARKET CONTEXT>

<CONTEXT TURNS>
${JSON.stringify(contextTurns, null, 2)}
</CONTEXT TURNS>

<TARGET TURN>
${JSON.stringify(targetTurn, null, 2)}
</TARGET TURN>

Return ONLY JSON.
`;

    console.log("🧠 Sending error analysis to OpenAI...");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return ONLY strict JSON. No commentary." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("❌ JSON parse error:", raw);
      return NextResponse.json(
        { error: "Failed to parse model output", raw },
        { status: 500 }
      );
    }

    // --------------------------------------------------
    // FINAL NORMALIZATION
    // --------------------------------------------------

    const finalResponse = {
      ID: turnID,
      speaker: targetTurn.speaker ?? null,
      errorMatch: parsed.errorMatch ?? null,
      errorExplanation: parsed.errorExplanation ?? null,
      errorConfidence: parsed.errorConfidence ?? null,
      errorMatchTimestamp: new Date().toISOString(),
    };

    return NextResponse.json(finalResponse, { status: 200 });

  } catch (err) {
    console.error("🚨 /api/error2 handler error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 }
    );
  }
}
