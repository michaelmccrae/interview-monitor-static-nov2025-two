import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  console.log("🚀📈 /api/ticker POST handler triggered");

  try {
    console.log("📥 Parsing request payload...");
    const payload = await req.json();

    // ---------------------------------------------
    // 1. EXTRACT TARGET TURN
    // ---------------------------------------------
    let targetTurn = null;

    if (Array.isArray(payload)) {
      console.log(`📦 Payload is array (length: ${payload.length})`);
      targetTurn = payload[payload.length - 1] || null;
    } else if (payload?.turn) {
      console.log("📦 Payload is object with `turn` property");
      targetTurn = payload.turn;
    } else {
      console.log("⚠️ Payload shape not recognized");
    }

    if (!targetTurn?.text) {
      console.log("❌ No valid turn text found");
      return NextResponse.json(
        { error: "Invalid payload: no turn text found." },
        { status: 400 }
      );
    }

    const turnID = targetTurn.ID ?? null;
    console.log(`🧠 Analyzing Turn ID: ${turnID}`);
    console.log(`🗣️ Speaker: ${targetTurn.speaker}`);
    console.log(
      `📝 Text preview: "${targetTurn.text.slice(0, 120)}${
        targetTurn.text.length > 120 ? "..." : ""
      }"`
    );

    // ---------------------------------------------
    // 2. PROMPT
    // ---------------------------------------------
    // ---------------------------------------------
    // 2. PROMPT (Optimized for Google Finance)
    // ---------------------------------------------
    console.log("✍️ Building OpenAI prompt...");

    const prompt = `
Analyze the text below.

Task:
1. Identify any PUBLIC COMPANIES mentioned.
2. Extract their **Google Finance compatible** Ticker and Exchange codes.
3. Ignore private companies, general indices (like S&P 500), or commodities unless a specific ETF/Trust is mentioned.

Rules for Google Finance Compatibility:
- **Exchange Codes**: You MUST use the Google Finance specific exchange code.
  - Toronto Stock Exchange (TSX) -> use "TSE"
  - TSX Venture Exchange (TSX-V) -> use "CVE"
  - London Stock Exchange (LSE) -> use "LON"
  - Hong Kong (HKEX) -> use "HKG"
  - Paris (Euronext) -> use "EPA"
  - OTC Markets -> use "OTCMKTS"
  - NASDAQ -> "NASDAQ"
  - NYSE -> "NYSE"
- **Tickers**: Use the root ticker (e.g., "BRK.B" should be formatted as Google expects, often just "BRK.B" or "BRK-B").
- **Precision**: If a company is dual-listed, prioritize the US listing (NYSE/NASDAQ) unless the text specifically discusses the local market (e.g., "Australian mining stocks").

Schema (Maintain parallel arrays):
{
  "companyName": ["Taiwan Semiconductor", "Bank of Montreal"],
  "ticker": ["TSM", "BMO"],
  "exchange": ["NYSE", "TSE"]
}

Text:
"${targetTurn.text}"
`;

    // ---------------------------------------------
    // 3. OPENAI CALL
    // ---------------------------------------------
    console.log("🤖 Sending request to OpenAI (gpt-4o-mini)...");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return ONLY valid JSON. No commentary."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    console.log("✅ OpenAI response received");

    const raw = completion.choices[0].message.content;
    console.log("📄 Raw model output:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
      console.log("🧩 JSON parsed successfully");
    } catch (err) {
      console.error("❌🧨 JSON parse error", err);
      return NextResponse.json(
        { error: "Failed to parse model response", raw },
        { status: 500 }
      );
    }

    // ---------------------------------------------
    // 4. FINAL RESPONSE
    // ---------------------------------------------
    const finalResponse = {
      ID: turnID,
      speaker: targetTurn.speaker ?? null,
      companyName: parsed.companyName ?? null,
      ticker: parsed.ticker ?? null,
      exchange: parsed.exchange ?? null,
      tickerTimestamp: new Date().toISOString()
    };

    console.log("📊 Final ticker extraction result:", {
      companyCount: Array.isArray(finalResponse.companyName)
        ? finalResponse.companyName.length
        : 0,
      companies: finalResponse.companyName,
      tickers: finalResponse.ticker
    });

    console.log("🏁 /api/ticker completed successfully");

    return NextResponse.json(finalResponse, { status: 200 });

  } catch (error) {
    console.error("🚨🔥 /api/ticker fatal error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
