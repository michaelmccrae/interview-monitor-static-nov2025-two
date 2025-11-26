import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 speakerrole6a POST starting...");

  try {
    let turnData = await req.json();

    console.log("🔥 RAW BODY RECEIVED:", JSON.stringify(turnData, null, 2));

    // ------------------------------
    // BASIC VALIDATION
    // ------------------------------
    if (!Array.isArray(turnData)) {
      return NextResponse.json(
        { error: "Payload must be an array of turn objects" },
        { status: 400 }
      );
    }

    for (const t of turnData) {
      if (!t || typeof t !== "object") {
        return NextResponse.json(
          { error: "Each turn must be an object" },
          { status: 400 }
        );
      }
      if (!t.text || typeof t.text !== "string") {
        return NextResponse.json(
          { error: "Each turn object must contain a text field" },
          { status: 400 }
        );
      }
    }

    // ID of the last turn
    const lastTurn = turnData[turnData.length - 1];
    const turnID = lastTurn.ID;

    // ------------------------------
    // PROMPT (your exact style)
    // ------------------------------
    const prompt = `
You are an automated JSON generator. Your ONLY task is to infer who is the interviewer and who is the guest.

STRICT RULES:
1. Output MUST be valid JSON.
2. Allowed keys ONLY:
   - "speakerRole"
   - "speakerRoleConfidence"
   - "speakerRoleTimestamp"
3. "speakerRole" MUST be an array of strings.
4. "speakerRoleConfidence" MUST be an array of numbers.
5. "speakerRoleTimestamp" MUST be an ISO timestamp.
6. No explanation. No comments. JSON only.

Analyze this array of conversation turns:

<OBJECT>
${JSON.stringify(turnData, null, 2)}
</OBJECT>

Return ONLY the JSON.
`;

    console.log("🧠 Sending prompt to OpenAI...");

    // ------------------------------
    // OPENAI CALL (same pattern as speakername6a)
    // ------------------------------
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

    // ------------------------------
    // WHITELIST ONLY ALLOWED KEYS
    // ------------------------------
    const allowed = new Set([
      "speakerRole",
      "speakerRoleConfidence",
      "speakerRoleTimestamp",
    ]);

    for (const key of Object.keys(parsed)) {
      if (!allowed.has(key)) delete parsed[key];
    }

    // Server timestamp override
    parsed.speakerRoleTimestamp = new Date().toISOString();

    // ------------------------------
    // FINAL RESPONSE
    // ------------------------------
    const finalResponse = {
      // ID: turnID,
      // "metadata": "speaker role",
      ...parsed,
    };

    console.log("📤 Sending final:", finalResponse);
    return NextResponse.json(finalResponse, { status: 200 });
  } catch (error) {
    console.error("🚨 Handler Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
