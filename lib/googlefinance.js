/**
 * Constructs a Google Finance deep link.
 *
 * @param {string} ticker - The stock ticker (e.g., "TSM", "BMO").
 * @param {string} exchange - The Google-compatible exchange code (e.g., "NYSE", "TSE").
 * @returns {string} The formatted URL.
 */
export function getGoogleFinanceUrl(ticker, exchange) {
  // 1. Validation: If missing data, fallback to a general search or return null
  if (!ticker || !exchange) {
    if (ticker) return `https://www.google.com/finance/quote/${ticker}`; // Fallback if no exchange
    return "https://www.google.com/finance"; // Fallback to home
  }

  // 2. Sanitation: Ensure upper case and remove incidental whitespace
  const cleanTicker = ticker.trim().toUpperCase();
  const cleanExchange = exchange.trim().toUpperCase();

  // 3. Construction: "https://www.google.com/finance/quote/TICKER:EXCHANGE"
  return `https://www.google.com/finance/quote/${cleanTicker}:${cleanExchange}`;
}