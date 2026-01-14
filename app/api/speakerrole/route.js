import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 speakerrole POST starting...");

  try {
    let turnData = await req.json();

    // ------------------------------
    // 1. ANALYZE SPEAKER IDs
    // ------------------------------
    if (!Array.isArray(turnData)) {
      return NextResponse.json({ error: "Payload must be an array" }, { status: 400 });
    }

    // Find the highest speaker ID to constrain the LLM
    const speakerIds = turnData.map(t => t.speaker).filter(s => typeof s === 'number');
    const maxSpeakerId = speakerIds.length > 0 ? Math.max(...speakerIds) : 0;
    const expectedLength = maxSpeakerId + 1;

    console.log(`📊 Max Speaker ID: ${maxSpeakerId} (Expecting array of length ${expectedLength})`);

    // ------------------------------
    // 2. PROMPT
    // ------------------------------
    const prompt = `
You are an automated JSON generator. Your ONLY task is to infer the role of each unique speaker ID found in the conversation.

STRICT DATA RULES:
1. The conversation has Speaker IDs ranging from 0 to ${maxSpeakerId}.
2. Your "speakerRole" array MUST have exactly ${expectedLength} items.
   - Index 0 corresponds to Speaker 0.
   - Index 1 corresponds to Speaker 1.
   - ...
   - Index ${maxSpeakerId} corresponds to Speaker ${maxSpeakerId}.
3. Do NOT output a role for every turn. Consolidate by Speaker ID.

OUTPUT FORMAT:
{
  "speakerRole": ["RoleForSpeaker0", "RoleForSpeaker1", ...],
  "speakerRoleConfidence": [0.9, 1.0, ...],
  "speakerRoleTimestamp": "ISO_STRING"
}

ROLE CLASSIFICATION RULES:
- "Interviewer": The host or moderator. Leads the show.
- "Guest": A participant answering questions.
- "Announcer": A voice used ONLY for intros, outros, or ads.
- "Voiceover": Narrator providing context.
- "Undefined": Background noise or impossible to determine.

Analyze this conversation:
<OBJECT>
${JSON.stringify(turnData, null, 2)}
</OBJECT>

Return ONLY the JSON.
`;

    // ------------------------------
    // 3. OPENAI CALL
    // ------------------------------
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", 
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that outputs strict JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = completion.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON from model", raw }, { status: 500 });
    }

    // ------------------------------
    // 4. SANITIZATION LAYER
    // ------------------------------
    // Ensure array length matches expected speakers (fill missing with "Undefined")
    if (Array.isArray(parsed.speakerRole)) {
        // Truncate if too long (fix for your specific bug)
        if (parsed.speakerRole.length > expectedLength) {
            parsed.speakerRole = parsed.speakerRole.slice(0, expectedLength);
            if (parsed.speakerRoleConfidence) {
                parsed.speakerRoleConfidence = parsed.speakerRoleConfidence.slice(0, expectedLength);
            }
        }
        
        // Pad if too short
        while (parsed.speakerRole.length < expectedLength) {
            parsed.speakerRole.push("Undefined");
            if (parsed.speakerRoleConfidence) parsed.speakerRoleConfidence.push(0);
        }
    }

    // Server timestamp override
    parsed.speakerRoleTimestamp = new Date().toISOString();

    const finalResponse = { ...parsed };

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