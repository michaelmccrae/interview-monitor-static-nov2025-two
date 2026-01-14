import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 Starting /api/lookup POST handler...");

  try {
    const payload = await req.json();
    
    // ------------------------------------------------------
    // 1. HANDLE PAYLOAD (Array vs Object Wrapper)
    // ------------------------------------------------------
    let targetTurn = null;
    let ignoreList = [];

    if (Array.isArray(payload)) {
      // Legacy behavior: Payload is just [turn, turn...]
      if (payload.length > 0) targetTurn = payload[payload.length - 1];
    } else if (payload && typeof payload === "object") {
      // New behavior: Payload is { turn: {...}, ignoreList: [...] }
      if (payload.turn) targetTurn = payload.turn;
      if (Array.isArray(payload.ignoreList)) ignoreList = payload.ignoreList;
    }

    // Validation
    if (!targetTurn || !targetTurn.text) {
      return NextResponse.json(
        { error: "Invalid payload: Could not locate a valid 'turn' object with text." },
        { status: 400 }
      );
    }

    const turnID = targetTurn.ID;
    console.log(` - Processing Turn ID: ${turnID}`);
    // console.log(` - Ignore List Size: ${ignoreList.length}`);

    // ------------------------------------------------------
    // 2. PROMPT CONSTRUCTION
    // ------------------------------------------------------
    const prompt = `
You provide background explanations for domain-specific terminology that listeners may want to look up.

Your job:
1. Identify terms in the text that require explanation (companies, technologies, geologic terms, economic terms, etc.).
2. Provide:
   • lookupTerm[] — the key terms 
   • lookupLink[] — a reputable link (Wikipedia preferred) 
   • lookupExplanation[] — clear, factual background 
3. If NOTHING needs lookup, return null for all fields.

STRICT RULES:
- Do NOT include an ID field.
- Do NOT make up fake websites.
- Use real Wikipedia or official links only.
- Output ONLY strict JSON.
- Arrays must be the same length.
- **IGNORE** any terms found in this list (already defined): ${JSON.stringify(ignoreList)}

<SCHEMA EXAMPLE>
{
  "speaker": "0",
  "lookupTerm": ["Goldman Sachs"],
  "lookupLink": ["https://en.wikipedia.org/wiki/Goldman_Sachs"],
  "lookupExplanation": ["Goldman Sachs is a global investment bank headquartered in New York."],
  "lookupTermTimestamp": "2025-01-01T00:00:00.000Z"
}
</SCHEMA EXAMPLE>

Analyze this text:
"${targetTurn.text}"

Return ONLY JSON matching the schema above.
`;

    // ------------------------------------------------------
    // 3. OPENAI CALL
    // ------------------------------------------------------
    // console.log("🧠 Sending prompt to OpenAI...");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", // Corrected from gpt-4.1-mini
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return ONLY strict JSON. No commentary. No Markdown."
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
        { error: "Failed parsing model response", raw: jsonString },
        { status: 500 }
      );
    }

    // Clean up internal fields if model hallucinated them
    delete parsedResponse.ID;
    delete parsedResponse.id;

    // ------------------------------------------------------
    // 4. SERVER FINAL OUTPUT
    // ------------------------------------------------------
    const finalResponse = {
      ID: turnID,
      ...parsedResponse,
      speaker: targetTurn.speaker,
      lookupTermTimestamp: new Date().toISOString(),
    };

    // console.log("📤 Sending final response:", finalResponse);

    return NextResponse.json(finalResponse, { status: 200 });

  } catch (error) {
    console.error("🚨 /api/lookup Handler Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}