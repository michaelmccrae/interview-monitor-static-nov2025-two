import { NextResponse } from "next/server";

// --------------------------------------------------
// IN-MEMORY CACHES (prototype-safe)
// --------------------------------------------------
const QUOTE_CACHE = new Map();          // ticker -> price data
const META_CACHE = new Map();           // ticker -> reference metadata
const ENTITY_RESOLVE_CACHE = new Map(); // canonicalName -> enriched object

// --------------------------------------------------
// CANONICAL COMPANY MAP (seed only; expandable)
// --------------------------------------------------
const COMPANY_MAP = {
  barclays: {
    canonicalName: "Barclays",
    ticker: "BARC.L",
    aliases: [
      "barclays investment bank",
      "barclays plc",
      "barclays bank"
    ]
  }
};

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
function normalize(str) {
  return str.toLowerCase().trim();
}

function resolveCompany(term) {
  const key = normalize(term);

  if (COMPANY_MAP[key]) return COMPANY_MAP[key];

  for (const entry of Object.values(COMPANY_MAP)) {
    if (entry.aliases?.includes(key)) return entry;
  }

  return null;
}

// --------------------------------------------------
// POLYGON: PRICE (aggregates)
// --------------------------------------------------
async function fetchPolygonPrice(ticker) {
  if (QUOTE_CACHE.has(ticker)) return QUOTE_CACHE.get(ticker);

  try {
    const res = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apiKey=${process.env.POLYGON_API_KEY}`,
      { cache: "no-store" }
    );

    if (!res.ok) return null;

    const json = await res.json();
    const bar = json?.results?.[0];
    if (!bar) return null;

    const price = {
      price: bar.c,
      asOf: new Date(bar.t).toISOString()
    };

    QUOTE_CACHE.set(ticker, price);
    return price;
  } catch {
    return null;
  }
}

// --------------------------------------------------
// POLYGON: BASIC METADATA (reference)
// --------------------------------------------------
async function fetchPolygonMeta(ticker) {
  if (META_CACHE.has(ticker)) return META_CACHE.get(ticker);

  try {
    const res = await fetch(
      `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${process.env.POLYGON_API_KEY}`,
      { cache: "no-store" }
    );

    if (!res.ok) return null;

    const json = await res.json();
    const r = json?.results;
    if (!r) return null;

    const meta = {
      exchange: r.primary_exchange ?? null,
      currency: r.currency_name ?? null,
      name: r.name ?? null,
      market: r.market ?? null
    };

    META_CACHE.set(ticker, meta);
    return meta;
  } catch {
    return null;
  }
}

// --------------------------------------------------
// ROUTE HANDLER
// --------------------------------------------------
export async function POST(req) {
  try {
    const { entities } = await req.json();

    if (!Array.isArray(entities)) {
      return NextResponse.json(
        { error: "entities[] required" },
        { status: 400 }
      );
    }

    const results = {};

    for (const e of entities) {
      if (e.type !== "COMPANY" || !e.term) continue;

      // Resolve canonical company
      let mapping = resolveCompany(e.term);
      let ticker = mapping?.ticker ?? null;
      let canonicalName = mapping?.canonicalName ?? e.term;

      // -------------------------------------------
      // FALLBACK: Polygon ticker search (free tier)
      // -------------------------------------------
      if (!ticker) {
        try {
          const search = await fetch(
            `https://api.polygon.io/v3/reference/tickers?search=${encodeURIComponent(e.term)}&active=true&limit=1&apiKey=${process.env.POLYGON_API_KEY}`
          );
          const json = await search.json();
          const hit = json?.results?.[0];
          if (hit?.ticker) {
            ticker = hit.ticker;
            canonicalName = hit.name ?? canonicalName;
          }
        } catch {}
      }

      // -------------------------------------------
      // If still unresolved → return stub
      // -------------------------------------------
      if (!ticker) {
        results[e.term] = {
          canonicalName,
          ticker: null,
          price: null,
          exchange: null,
          currency: null,
          asOf: null,
          source: "polygon",
          resolvedFrom: "unresolved",
          error: "ticker_not_found"
        };
        continue;
      }

      // -------------------------------------------
      // Cache canonical entity
      // -------------------------------------------
      if (ENTITY_RESOLVE_CACHE.has(canonicalName)) {
        results[canonicalName] = ENTITY_RESOLVE_CACHE.get(canonicalName);
        continue;
      }

      // -------------------------------------------
      // Fetch data (free-tier safe)
      // -------------------------------------------
      const [price, meta] = await Promise.all([
        fetchPolygonPrice(ticker),
        fetchPolygonMeta(ticker)
      ]);

      const enriched = {
        canonicalName,
        ticker,
        exchange: meta?.exchange ?? null,
        currency: meta?.currency ?? null,
        price: price?.price ?? null,
        changePercent: null, // optional later
        marketCap: null,     // paid tier only
        asOf: price?.asOf ?? null,
        source: "polygon",
        resolvedFrom: mapping ? "static-map" : "ticker-search",
        aliases: mapping?.aliases ?? [],
        error: price ? null : "price_unavailable"
      };

      ENTITY_RESOLVE_CACHE.set(canonicalName, enriched);
      results[canonicalName] = enriched;
    }

    if (Object.keys(results).length === 0) {
      console.warn(
        "⚠️ Financial enrichment returned no results for entities:",
        entities.map((e) => `${e.type}:${e.term}`)
      );
    }

    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    console.error("/api/financial-enrich error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
