import { NextResponse } from "next/server";

const BASE_URL = "https://financialmodelingprep.com/api/v3";
const API_KEY = process.env.FMP_API_KEY;

export async function GET(req) {
  // 1. Define Symbols
  const commodities = ["GC=F", "CL=F", "SI=F"]; // Gold, Oil, Silver
  const crypto = ["BTCUSD", "ETHUSD"];
  const stocks = ["SPY", "QQQ", "IWM", "NVDA", "AAPL", "MSFT", "TSLA"]; // ETFs + Major Movers

  // 2. Fetch Helper
  const fetchData = async (endpoint) => {
    try {
      const res = await fetch(`${BASE_URL}/${endpoint}?apikey=${API_KEY}`, {
        next: { revalidate: 300 }, // Cache 5 mins
      });
      if (!res.ok) throw new Error(`FMP API Error: ${res.statusText}`);
      return await res.json();
    } catch (error) {
      console.error(error);
      return [];
    }
  };

  try {
    // 3. Parallel Execution
    const [stockData, cryptoData, commodityData, fedRateData] = await Promise.all([
      fetchData(`quote/${stocks.join(",")}`),
      fetchData(`quote/${crypto.join(",")}`),
      fetchData(`quote/${commodities.join(",")}`),
      fetchData(`economic-indicator/federal_funds_rate?limit=1`), 
    ]);

    // 4. Format Macro Data
    const currentFedRate = Array.isArray(fedRateData) && fedRateData.length > 0 ? fedRateData[0] : null;

    // 5. Structure for LLM Consumption
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      market: {
        stocks: stockData,
        crypto: cryptoData,
        commodities: commodityData,
      },
      macro: {
        fedFundsRate: currentFedRate,
      },
    });

  } catch (error) {
    console.error("Market Data Fetch Error:", error);
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}