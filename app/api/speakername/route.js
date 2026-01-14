import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 speakername POST starting...");

  try {
    const turnData = await req.json();

    console.log("🔥 RAW BODY RECEIVED:", JSON.stringify(turnData, null, 2));

    // -----------------------------
    // VALIDATION
    // -----------------------------
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
      if (typeof t.text !== "string") {
        return NextResponse.json(
          { error: "Each turn must include a text field" },
          { status: 400 }
        );
      }
    }

    // -----------------------------
    // DERIVE SPEAKER RANGE
    // -----------------------------
    const maxSpeakerIndex = Math.max(
      ...turnData.map(t =>
        typeof t.speaker === "number" ? t.speaker : -1
      )
    );

    if (maxSpeakerIndex < 0) {
      return NextResponse.json(
        { error: "No valid speaker indices found" },
        { status: 400 }
      );
    }

    // -----------------------------
    // PROMPT
    // -----------------------------
    const prompt = `
You are given a transcript with speaker diarization IDs.

CRITICAL INVARIANTS:
- Each speaker index represents ONE UNIQUE HUMAN.
- A speaker index MUST map to ONLY ONE NAME for the entire transcript.
- DO NOT reuse the same name for different speaker indices.
- If a speaker introduces themselves at any point, use that name for the entire transcript.
- Do NOT null a speaker name once confidently identified.
- Only use null if the speaker never self-identifies or is clearly an advertisement or studio ident.


Your task:
Return speaker metadata indexed strictly by speaker ID.

STRICT RULES:
1. Output MUST be valid JSON.
2. Allowed keys ONLY:
   - "speakerName"
   - "speakerNameConfidence"
   - "speakerNameTimestamp"
3. "speakerName" MUST be an array indexed by speaker ID.
4. "speakerNameConfidence" MUST be an array indexed by speaker ID.
5. Arrays MUST be same length.
6. Array length = (max speaker index) + 1.
7. Use null where identity is unknown.
8. Do NOT include explanations or comments.

KNOWN PATTERNS:
- Podcast hosts often introduce themselves explicitly (e.g. "I'm Joe Wiesenthal")
- Short interjections ("Yeah", "Right") belong to the same speaker as surrounding turns
- Ads and studio idents should return null


<TRANSCRIPT>
${JSON.stringify(turnData, null, 2)}
</TRANSCRIPT>
`;

    console.log("🧠 Sending prompt to OpenAI...");

    // -----------------------------
    // OPENAI CALL
    // -----------------------------
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
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

    // -----------------------------
    // NORMALIZE ARRAY SHAPES
    // -----------------------------
    function normalizeArray(arr, length) {
      const out = Array.isArray(arr) ? [...arr] : [];
      while (out.length < length) out.push(null);
      return out.slice(0, length);
    }

    parsed.speakerName = normalizeArray(
      parsed.speakerName,
      maxSpeakerIndex + 1
    );

    parsed.speakerNameConfidence = normalizeArray(
      parsed.speakerNameConfidence,
      maxSpeakerIndex + 1
    );

    // -----------------------------
    // 🧠 ENFORCE 1:1 SPEAKER ↔ NAME
    // -----------------------------
    // const seenNames = new Set();

    // parsed.speakerName = parsed.speakerName.map((name, idx) => {
    //   if (!name || typeof name !== "string") return null;

    //   const normalized = name.trim().toLowerCase();

    //   if (seenNames.has(normalized)) {
    //     console.warn(
    //       `⚠️ Duplicate speaker name "${name}" detected for speaker ${idx}. Nulling.`
    //     );
    //     parsed.speakerNameConfidence[idx] = null;
    //     return null;
    //   }

    //   seenNames.add(normalized);
    //   return name.trim();
    // });

    // -----------------------------
    // FILTER ALLOWED KEYS
    // -----------------------------
    const allowed = new Set([
      "speakerName",
      "speakerNameConfidence",
      "speakerNameTimestamp",
    ]);

    for (const key of Object.keys(parsed)) {
      if (!allowed.has(key)) delete parsed[key];
    }

    // Server-side timestamp wins
    parsed.speakerNameTimestamp = new Date().toISOString();

    const finalResponse = { ...parsed };

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
