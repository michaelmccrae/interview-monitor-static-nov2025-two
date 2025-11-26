import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀 Starting /api/followup6a POST handler...");

  try {
    // Followup ALWAYS receives an array of turn objects
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

    // Followup always analyzes ONLY the last completed turn
    const lastTurn = turnData[turnData.length - 1];

    if (!lastTurn || typeof lastTurn !== "object") {
      return NextResponse.json(
        { error: "Last turn is missing or invalid" },
        { status: 400 }
      );
    }

    if (!lastTurn.text || typeof lastTurn.text !== "string") {
      return NextResponse.json(
        { error: "Missing 'text' field in last turn" },
        { status: 400 }
      );
    }

    const turnID = lastTurn.ID;
    console.log(" - lastTurn ID:", turnID);

    // -----------------------------------------------------
    // RELEVANCE / LENGTH FILTER: SKIP SHORT / TRIVIAL TURNS
    // -----------------------------------------------------
    const wordCount =
      typeof lastTurn.numberOfWords === "number"
        ? lastTurn.numberOfWords
        : lastTurn.text.trim().split(/\s+/).filter(Boolean).length;

    // Heuristic: skip if very short (e.g., "Thanks", "Yeah", etc.)
    const MIN_WORDS_FOR_FOLLOWUP = 8;

    if (wordCount < MIN_WORDS_FOR_FOLLOWUP) {
      console.log(
        `⏭ Skipping followup analysis — only ${wordCount} words (below ${MIN_WORDS_FOR_FOLLOWUP})`
      );
      const skipResponse = {
        ID: turnID,
        speaker: lastTurn.speaker,
        followupQuestion: null,
        followupConfidence: null,
        followupQuestionTimestamp: new Date().toISOString(),
      };
      return NextResponse.json(skipResponse, { status: 200 });
    }

    // =====================================================
    // PROMPT
    // =====================================================
    const prompt = `
You generate follow-up questions ONLY when the speaker says something substantive
that naturally leads to clarifying or probing questions.

STRICT RULES:
1. If the turn is short, generic, conversational, or does not introduce or expand on a topic,
   return null for all fields.
2. Do NOT generate questions for greetings, acknowledgements, yes/no responses,
   filler speech, or short confirmatory remarks.
3. Do NOT invent topics or ask irrelevant questions.
4. Return ONLY strict JSON.
5. Do NOT include an ID field.
6. Arrays must be the same length.
7. If no follow-up question is appropriate, return:

   {
     "speaker": "<speaker>",
     "followupQuestion": null,
     "followupConfidence": null,
     "followupQuestionTimestamp": "2025-01-01T00:00:00.000Z"
   }

VALID FOLLOW-UP QUESTIONS:
- Clarify uncertainty
- Ask about causes, mechanisms, or reasoning
- Ask about implications or consequences
- Ask about missing details that matter

<SCHEMA EXAMPLE>
{
  "speaker": "0",
  "followupQuestion": [
    "When do you expect gold prices to begin trending upward?",
    "What conditions would alter your current forecast?"
  ],
  "followupConfidence": [0.90, 0.65],
  "followupQuestionTimestamp": "2025-01-01T00:00:00.000Z"
}
</SCHEMA EXAMPLE>

Analyze ONLY the most recent turn:

<OBJECT>
${JSON.stringify(lastTurn, null, 2)}
</OBJECT>

Return ONLY JSON that matches the schema above.
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
          content: "Return ONLY strict JSON. No commentary. No Markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
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
      followupQuestionTimestamp: new Date().toISOString(),
    };

    console.log("📤 Sending final response:", finalResponse);

    return NextResponse.json(finalResponse, { status: 200 });
  } catch (error) {
    console.error("🚨 /api/followup6a Handler Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
