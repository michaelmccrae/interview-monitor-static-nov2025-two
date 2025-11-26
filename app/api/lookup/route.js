import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 Starting /api/lookup6a POST handler...");

  try {
    // Lookup ALWAYS receives an array of turn objects
    const turnData = await req.json();

    if (!Array.isArray(turnData)) {
      return NextResponse.json(
        { error: "Payload must be an array of turn objects" },
        { status: 400 }
      );
    }

    console.log("Payload:", turnData);

    if (turnData.length === 0) {
      return NextResponse.json(
        { error: "Empty array provided" },
        { status: 400 }
      );
    }

    // Lookup always analyzes ONLY the last completed turn
    const lastTurn = turnData[turnData.length - 1];

    if (!lastTurn.text) {
      return NextResponse.json(
        { error: "Missing 'text' field in last turn" },
        { status: 400 }
      );
    }

    const turnID = lastTurn.ID;
    console.log(" - lastTurn ID:", turnID);

    // =====================================================
    // PROMPT
    // =====================================================
    const prompt = `
You provide background explanations for domain-specific terminology that listeners may want to look up.

Your job:
1. Identify terms in the transcript that require explanation (companies, technologies, geologic terms, economic terms, etc.)
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

<SCHEMA EXAMPLE>
{
  "speaker": "0",
  "lookupTerm": ["Goldman Sachs"],
  "lookupLink": ["https://en.wikipedia.org/wiki/Goldman_Sachs"],
  "lookupExplanation": ["Goldman Sachs is a global investment bank headquartered in New York."],
  "lookupTermTimestamp": "2025-01-01T00:00:00.000Z"
}
</SCHEMA EXAMPLE>

Analyze the MOST RECENT turn:

<OBJECT>
${JSON.stringify(lastTurn, null, 2)}
</OBJECT>

Return ONLY JSON matching the schema above.
`;

    // =====================================================
    // OPENAI CALL
    // =====================================================
    console.log("🧠 Sending prompt to OpenAI...");

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
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
    console.log("✨ Raw OpenAI output:", jsonString);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(jsonString);
      console.log("⚙️ Parsed JSON OK.");
    } catch (err) {
      console.error("❌ JSON parse error:", err);
      return NextResponse.json(
        { error: "Failed parsing model response", raw: jsonString },
        { status: 500 }
      );
    }

    // clean hallucinated fields
    delete parsedResponse.ID;
    delete parsedResponse.id;

    // =====================================================
    // SERVER FINAL OUTPUT
    // =====================================================
    const finalResponse = {
      ID: turnID,
      ...parsedResponse,
      speaker: lastTurn.speaker,
      lookupTermTimestamp: new Date().toISOString(),
    };

    console.log("📤 Sending final response:", finalResponse);

    return NextResponse.json(finalResponse, { status: 200 });

  } catch (error) {
    console.error("🚨 /api/lookup6a Handler Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
