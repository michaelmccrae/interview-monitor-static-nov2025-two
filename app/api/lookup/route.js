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
      if (payload.length > 0) targetTurn = payload[payload.length - 1];
    } else if (payload && typeof payload === "object") {
      if (payload.turn) targetTurn = payload.turn;
      if (Array.isArray(payload.ignoreList)) ignoreList = payload.ignoreList;
    }

    if (!targetTurn || !targetTurn.text) {
      return NextResponse.json(
        { error: "Invalid payload: Could not locate a valid 'turn' object with text." },
        { status: 400 }
      );
    }

    const turnID = targetTurn.ID;
    console.log(` - Processing Turn ID: ${turnID}`);

    // ------------------------------------------------------
    // 2. PROMPT CONSTRUCTION (IMPROVED ENTITY TYPING + CANONICAL)
    // ------------------------------------------------------
    const prompt = `
You provide background explanations for domain-specific terminology.

Your job:
1. Identify terms in the text that may need explanation.
2. For each term, classify it STRICTLY as ONE of:
   - PERSON
   - COMPANY
   - ORGANIZATION
   - TICKER
   - COMMODITY
   - PROJECT
   - ECONOMIC_TERM
   - FINANCIAL_METRIC
   - GEOLOGIC_TERM
   - JARGON

STRICT CLASSIFICATION RULES:
- PERSON = real human beings (executives, founders, politicians, investors).
- COMPANY = for-profit corporations only.
- ORGANIZATION = government agencies, NGOs, universities, regulators.
- Do NOT classify people as companies.
- Do NOT classify government bodies as companies.

3. For each term provide:
   • lookupTerm[]
   • lookupType[]
   • lookupLink[]
   • lookupExplanation[]
   • canonicalName[] (normalized public name if applicable, else null)
   • isPublicCompany[] (true/false/null)
   • confidence[] (0.0–1.0 confidence in classification)

4. If NOTHING needs lookup, return null for ALL fields.

STRICT OUTPUT RULES:
- Output ONLY strict JSON.
- Do NOT include ID fields.
- Arrays must be same length.
- Use real Wikipedia or official links only.
- IGNORE any term already defined in this list:
  ${JSON.stringify(ignoreList)}

<SCHEMA EXAMPLE>
{
  "speaker": "0",
  "lookupTerm": ["Barclays Investment Bank"],
  "lookupType": ["COMPANY"],
  "lookupLink": ["https://en.wikipedia.org/wiki/Barclays"],
  "lookupExplanation": [
    "Barclays Investment Bank is the investment banking division of Barclays PLC."
  ],
  "canonicalName": ["Barclays PLC"],
  "isPublicCompany": [true],
  "confidence": [0.94]
}
</SCHEMA EXAMPLE>

Analyze this text:
"${targetTurn.text}"

Return ONLY JSON matching the schema above.
`;

    // ------------------------------------------------------
    // 3. OPENAI CALL
    // ------------------------------------------------------
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
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

    // Defensive cleanup
    delete parsedResponse.ID;
    delete parsedResponse.id;

    // ------------------------------------------------------
    // 4. SANITY FILTER (SERVER-SIDE SAFETY NET)
    // ------------------------------------------------------
    if (Array.isArray(parsedResponse.lookupType)) {
      parsedResponse.lookupType = parsedResponse.lookupType.map((t, i) => {
        const term = parsedResponse.lookupTerm?.[i] || "";

        // Fallback guard: names with 2 words + capitals → PERSON
        if (
          t === "COMPANY" &&
          /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(term)
        ) {
          return "PERSON";
        }
        return t;
      });
    }

    // ------------------------------------------------------
    // 5. FINAL OUTPUT (BACKWARD-COMPATIBLE)
    // ------------------------------------------------------
    const finalResponse = {
      ID: turnID,
      speaker: targetTurn.speaker,
      lookupTerm: parsedResponse.lookupTerm ?? null,
      lookupType: parsedResponse.lookupType ?? null,
      lookupLink: parsedResponse.lookupLink ?? null,
      lookupExplanation: parsedResponse.lookupExplanation ?? null,

      // ✅ NEW OPTIONAL FIELDS (safe to ignore downstream)
      canonicalName: parsedResponse.canonicalName ?? null,
      isPublicCompany: parsedResponse.isPublicCompany ?? null,
      confidence: parsedResponse.confidence ?? null,

      lookupTermTimestamp: new Date().toISOString(),
    };

    return NextResponse.json(finalResponse, { status: 200 });

  } catch (error) {
    console.error("🚨 /api/lookup Handler Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
