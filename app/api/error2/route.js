import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 Starting /api/error2 POST handler...");

  try {
    const body = await req.json();

    // 1. Separate Context from Target
    let contextTurns = [];
    let targetTurn = null;

    if (Array.isArray(body)) {
      if (body.length === 0) {
        return NextResponse.json({ error: "Empty array payload" }, { status: 400 });
      }
      // The last item is the one we are actually checking
      targetTurn = body[body.length - 1];
      // Everything before it is context
      contextTurns = body.slice(0, body.length - 1);
    } else {
      // Fallback for legacy single-object calls
      targetTurn = body;
    }

    console.log(`Processing Turn ID: ${targetTurn.ID} (Context size: ${contextTurns.length})`);

    // Validation
    if (!targetTurn || typeof targetTurn !== "object") {
      return NextResponse.json(
        { error: "Invalid payload format" },
        { status: 400 }
      );
    }

    if (!targetTurn.text) {
      return NextResponse.json(
        { error: "Missing 'text' field in target turn" },
        { status: 400 }
      );
    }

    const turnID = targetTurn.ID;

    // --------------------------
    // PROMPT
    // --------------------------
    const prompt = `
You are a professional factual-error analyst with strict citation standards.

INSTRUCTIONS:
1. Analyze the "TARGET TURN" below for verifiable factual inaccuracies.
2. Use "CONTEXT TURNS" only for understanding pronouns and context.
3. **CRITICAL REQUIREMENT:** You must ONLY report an error if you can provide a specific citation (URL or well-known source name) that proves the statement is wrong. 
4. If you spot a likely error but cannot cite a source that disproves it, DO NOT report it.
5. In the "errorExplanation", you MUST include the citation (e.g., "According to [Source Name]..." or "See [URL]...").

STRICT RULES:
- Ignore opinions, tone, grammar, and style.
- Ignore errors in the Context Turns.
- Do NOT rewrite text.
- Output ONLY strict JSON.

<SCHEMA EXAMPLE>
{
  "speaker": "0",
  "errorMatch": ["string (the incorrect phrase)"],
  "errorExplanation": ["string (why it is wrong + CITATION)"],
  "errorConfidence": [0.0],
  "errorMatchTimestamp": "2025-01-01T00:00:00.000Z"
}
</SCHEMA EXAMPLE>

<CONTEXT TURNS>
${JSON.stringify(contextTurns, null, 2)}
</CONTEXT TURNS>

<TARGET TURN>
${JSON.stringify(targetTurn, null, 2)}
</TARGET TURN>

Return ONLY JSON that matches the schema example above. If no verifiable, citable errors are found, return an object with all fields set to null.
    `;

    console.log("🧠 Sending prompt to OpenAI...");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You output only strict JSON. No commentary."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const jsonString = completion.choices[0].message.content;
    
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(jsonString);
    } catch (err) {
      console.error("❌ JSON parse error:", err);
      return NextResponse.json(
        { error: "Failed to parse model output", raw: jsonString },
        { status: 500 }
      );
    }

    // Remove hallucinated fields
    delete parsedResponse.ID;
    delete parsedResponse.id;

    // --------------------------
    // FINAL SERVER ENRICHMENT
    // --------------------------
    const finalResponse = {
      ID: turnID,
      ...parsedResponse,
      speaker: targetTurn.speaker,
      errorMatchTimestamp: new Date().toISOString()
    };

    return NextResponse.json(finalResponse, { status: 200 });

  } catch (error) {
    console.error("🚨 Handler Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}