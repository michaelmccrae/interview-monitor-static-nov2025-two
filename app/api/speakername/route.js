import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 speakername6a POST starting...");

  try {
    let turnData = await req.json();

    console.log("🔥 RAW BODY RECEIVED:", JSON.stringify(turnData, null, 2));

    // Must be an array
    if (!Array.isArray(turnData)) {
      return NextResponse.json(
        { error: "Payload must be an array of turn objects" },
        { status: 400 }
      );
    }

    // Validate each turn
    for (const t of turnData) {
      if (!t || typeof t !== "object") {
        return NextResponse.json(
          { error: "Each turn must be an object" },
          { status: 400 }
        );
      }
      if (!t.text || typeof t.text !== "string") {
        return NextResponse.json(
          { error: "Each turn must include a text field" },
          { status: 400 }
        );
      }
    }

    // Last ID
    const lastTurn = turnData[turnData.length - 1];
    const turnID = lastTurn.ID;

    // PROMPT (unchanged)
    const prompt = `
You analyze a full transcript and infer who is speaking.

STRICT RULES:
1. Output MUST be a valid JSON object.
2. Allowed keys ONLY:
   - "speakerName"
   - "speakerNameConfidence"
   - "speakerNameTimestamp"
3. Do NOT include ID, id, speaker, text, or metadata.
4. "speakerName" MUST be an array of strings.
5. "speakerNameConfidence" MUST be an array of numbers.
6. "speakerNameTimestamp" MUST be an ISO timestamp.
7. No explanation. No comments. JSON only.

<OBJECT>
${JSON.stringify(turnData, null, 2)}
</OBJECT>
`;

    console.log("🧠 Sending prompt to OpenAI...");

    // ------------------------------------------
    // OPENAI CHAT COMPLETION CALL
    // ------------------------------------------
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = completion.choices[0].message.content;
    console.log("📥 Raw model JSON:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("❌ JSON parse error:", err);
      return NextResponse.json(
        { error: "Invalid JSON from model", raw },
        { status: 500 }
      );
    }

    // Filter only allowed keys
    const allowed = new Set([
      "speakerName",
      "speakerNameConfidence",
      "speakerNameTimestamp",
    ]);

    for (const key of Object.keys(parsed)) {
      if (!allowed.has(key)) delete parsed[key];
    }

    // Server timestamp override
    parsed.speakerNameTimestamp = new Date().toISOString();

    const finalResponse = {
      // ID: turnID,
      // "metadata": "speaker name",
      ...parsed,
    };

    console.log("📤 Sending final:", finalResponse);

    return NextResponse.json(finalResponse, { status: 200 });
  } catch (err) {
    console.error("🚨 Handler Error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 }
    );
  }
}
