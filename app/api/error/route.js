import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 Starting /api/error6a POST handler...");

  try {
    let turnData = await req.json();
    
    // unwrap array payloads
    if (Array.isArray(turnData)) {
      turnData = turnData[0];
    }

    console.log("Payload after unwrap:", turnData);

    // validation
    if (!turnData || typeof turnData !== "object") {
      return NextResponse.json(
        { error: "Invalid payload format" },
        { status: 400 }
      );
    }

    if (!turnData.text) {
      return NextResponse.json(
        { error: "Missing 'text' field in payload" },
        { status: 400 }
      );
    }

    const turnID = turnData.ID;
    console.log(" - turnID:", turnID);

    // --------------------------
    // PROMPT
    // --------------------------
    const prompt = `
You are a professional factual-error analyst. Your only job is:

1. Detect factual inaccuracies in the provided transcript.
2. Explain why each statement is wrong.
3. Assign a 0–1 confidence score.
4. If NOTHING is factually wrong, return an object with all fields null.

STRICT RULES:
- Ignore opinions and tone.
- Ignore grammar, style, wording issues.
- Do NOT rewrite text.
- Do NOT guess missing details.
- Do NOT add an ID field.
- Output ONLY strict JSON.
- Arrays must match in length.

An “error” means a verifiable factual claim that is incorrect or extremely implausible.

<SCHEMA EXAMPLE>
{
  "speaker": "0",
  "errorMatch": ["string"],
  "errorExplanation": ["string"],
  "errorConfidence": [0.0],
  "errorMatchTimestamp": "2025-01-01T00:00:00.000Z"
}
</SCHEMA EXAMPLE>

Analyze this object:

<OBJECT>
${JSON.stringify(turnData, null, 2)}
</OBJECT>

Return ONLY JSON that matches the schema example above.
    `;

    console.log("🧠 Sending prompt to OpenAI...");

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
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
    console.log("✨ Raw OpenAI output:", jsonString);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(jsonString);
      console.log("⚙️ Successfully parsed JSON.");
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
      speaker: turnData.speaker,
      errorMatchTimestamp: new Date().toISOString()
    };

    console.log("📤 Sending final response:", finalResponse);

    return NextResponse.json(finalResponse, { status: 200 });

  } catch (error) {
    console.error("🚨 Handler Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
