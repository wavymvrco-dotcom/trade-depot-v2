/**
 * News Aggregator — supports forex, stocks, crypto, bonds, commodities, indices
 * Fetches from multiple RSS feeds, filters by instrument type, caches 5 minutes.
 */

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  publishedDate: Date;
  currencies: string[];
  instruments: string[];
  category: "macro" | "central-bank" | "trade" | "market" | "technical" | "general";
}

const RSS_FEEDS = [
  { url: "https://www.forexlive.com/feed/news",                        source: "ForexLive",    sourceUrl: "https://www.forexlive.com",    instruments: ["forex", "commodities"] },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/",      source: "MarketWatch",  sourceUrl: "https://www.marketwatch.com",   instruments: ["stocks", "forex", "bonds", "indices"] },
  { url: "https://www.investing.com/rss/news.rss",                     source: "Investing.com",sourceUrl: "https://www.investing.com",     instruments: ["forex", "stocks", "crypto", "bonds", "commodities", "indices"] },
  { url: "https://www.fxstreet.com/news/latest/rss",                   source: "FXStreet",     sourceUrl: "https://www.fxstreet.com",      instruments: ["forex", "commodities"] },
];

// ─── Keyword patterns by instrument ────────────────────────────────────────────

const INSTRUMENT_PATTERNS: Record<string, RegExp> = {
  forex:       /\b(forex|currency|EUR|USD|GBP|JPY|AUD|CAD|CHF|NZD|exchange rate|FX|central bank|Fed|ECB|BOJ|BoE|RBA|interest rate|monetary policy|FOMC|DXY|dollar|pound|euro|yen|franc|loonie|kiwi|Aussie|NFP|payroll|CPI|PPI|PMI|inflation)\b/i,
  stocks:      /\b(stock|equity|share|S&P|NASDAQ|Dow Jones|earnings|IPO|dividend|NYSE|FTSE|DAX|Nikkei|market cap|bull|bear market|rally|selloff|buyback|PE ratio|EPS|revenue|analyst|upgrade|downgrade)\b/i,
  crypto:      /\b(bitcoin|BTC|ethereum|ETH|crypto|blockchain|DeFi|NFT|altcoin|stablecoin|USDT|Binance|Coinbase|Solana|XRP|Ripple|Web3|token|mining|halving|wallet|exchange hack)\b/i,
  bonds:       /\b(bond|treasury|yield|gilt|bund|note|coupon|fixed income|sovereign debt|credit rating|Moody|S&P rating|spread|duration|basis point|auction|Fed funds|QE|QT|taper)\b/i,
  commodities: /\b(gold|silver|oil|crude|WTI|Brent|natural gas|copper|platinum|palladium|wheat|corn|soybean|commodity|OPEC|energy|metal|mining|precious metal|XAU|XAUUSD|barrel|tonne)\b/i,
  indices:     /\b(index|indices|S&P 500|NASDAQ|Dow Jones|FTSE 100|DAX|CAC|Nikkei|Hang Seng|ASX|Russell|VIX|futures|ETF|sector rotation|market open|market close)\b/i,
};

const CURRENCY_PATTERNS: Record<string, RegExp> = {
  USD: /\b(USD|dollar|DXY|Fed|Federal Reserve|FOMC|US economy|US inflation|NFP|payroll|CPI)\b/i,
  EUR: /\b(EUR|euro|ECB|European Central Bank|eurozone|Germany|France|Italy|Spain)\b/i,
  GBP: /\b(GBP|pound|sterling|BoE|Bank of England|UK|Britain|Brexit|British)\b/i,
  JPY: /\b(JPY|yen|BOJ|Bank of Japan|Japan|Japanese|Nikkei)\b/i,
  AUD: /\b(AUD|Aussie|RBA|Reserve Bank of Australia|Australia|Australian)\b/i,
  CAD: /\b(CAD|loonie|BoC|Bank of Canada|Canada|Canadian|oil)\b/i,
  CHF: /\b(CHF|franc|SNB|Swiss National Bank|Switzerland|Swiss)\b/i,
  NZD: /\b(NZD|kiwi|RBNZ|Reserve Bank of New Zealand|New Zealand)\b/i,
  XAU: /\b(gold|XAU|XAUUSD|precious metal|bullion)\b/i,
};

const CATEGORY_PATTERNS: Record<NewsArticle["category"], RegExp> = {
  "central-bank": /\b(central bank|Fed|ECB|BOJ|BoE|RBA|SNB|RBNZ|rate hike|rate cut|interest rate|monetary policy|QE|quantitative easing|FOMC|hawkish|dovish)\b/i,
  "macro":        /\b(GDP|inflation|CPI|PPI|PMI|NFP|payroll|unemployment|retail sales|trade balance|economic|recession|growth)\b/i,
  "trade":        /\b(trade war|tariff|sanction|export|import|WTO|trade deal|OPEC)\b/i,
  "technical":    /\b(support|resistance|breakout|technical|chart|RSI|MACD|moving average|level|trend)\b/i,
  "market":       /\b(stock|equity|bond|yield|risk-off|risk-on|sentiment|commodity|oil|gold|crypto)\b/i,
  "general":      /./,
};

// ─── Relevance filter — drop clearly off-topic articles ─────────────────────

const IRRELEVANT_PATTERNS = [
  /\b(recipe|fashion|sports|celebrity|movie|music|gaming|lifestyle|health|diet|fitness|travel|tourism|weather forecast)\b/i,
  /\b(taylor swift|kardashian|actor|singer|athlete|nba|nfl|mlb|soccer|football score)\b/i,
];

function isRelevant(text: string): boolean {
  return !IRRELEVANT_PATTERNS.some(re => re.test(text));
}

const RSS_TAG_PATTERNS: Record<string, [RegExp, RegExp]> = {
  title:       [/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i,       /<title[^>]*>([\s\S]*?)<\/title>/i],
  link:        [/<link[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i,         /<link[^>]*>([\s\S]*?)<\/link>/i],
  guid:        [/<guid[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/guid>/i,         /<guid[^>]*>([\s\S]*?)<\/guid>/i],
  description: [/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i, /<description[^>]*>([\s\S]*?)<\/description>/i],
  pubDate:     [/<pubDate[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/pubDate>/i,   /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i],
};

function extractText(xml: string, tag: string): string {
  const patterns = RSS_TAG_PATTERNS[tag];
  if (!patterns) return "";
  for (const re of patterns) {
    const m = re.exec(xml);
    if (m?.[1]) return m[1].replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/g, c => ({
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'"
    }[c] ?? c)).trim();
  }
  return "";
}

function detectCurrencies(text: string): string[] {
  const found: string[] = [];
  for (const [ccy, re] of Object.entries(CURRENCY_PATTERNS)) {
    if (re.test(text)) found.push(ccy);
  }
  return found.length > 0 ? found : ["USD"];
}

function detectInstruments(text: string, feedInstruments: string[]): string[] {
  const found = new Set<string>(feedInstruments);
  for (const [inst, re] of Object.entries(INSTRUMENT_PATTERNS)) {
    if (re.test(text)) found.add(inst);
  }
  return Array.from(found);
}

function detectCategory(text: string): NewsArticle["category"] {
  for (const [cat, re] of Object.entries(CATEGORY_PATTERNS) as [NewsArticle["category"], RegExp][]) {
    if (cat !== "general" && re.test(text)) return cat;
  }
  return "general";
}

async function fetchFeed(feed: typeof RSS_FEEDS[0]): Promise<NewsArticle[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "TradeAI Terminal/2.0 (News Aggregator)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const items: NewsArticle[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRe.exec(xml)) !== null) {
      const item = match[1];
      const title = extractText(item, "title");
      const link = extractText(item, "link") || extractText(item, "guid");
      const description = extractText(item, "description");
      const pubDateStr = extractText(item, "pubDate");

      if (!title || title.length < 5) continue;

      const fullText = `${title} ${description}`;
      if (!isRelevant(fullText)) continue;

      const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

      items.push({
        id: `${feed.source}-${Buffer.from(link || title).toString("base64").slice(0, 16)}`,
        title: title.slice(0, 200),
        summary: description.slice(0, 400),
        link: link || feed.sourceUrl,
        source: feed.source,
        sourceUrl: feed.sourceUrl,
        publishedAt: pubDate.toISOString(),
        publishedDate: pubDate,
        currencies: detectCurrencies(fullText),
        instruments: detectInstruments(fullText, feed.instruments),
        category: detectCategory(fullText),
      });
    }

    return items;
  } catch (err: any) {
    console.warn(`[News] Feed ${feed.source} failed: ${err.message}`);
    return [];
  }
}

// 5-minute cache
let newsCache: NewsArticle[] | null = null;
let cacheExpiry = 0;

export async function getForexNews(instruments?: string[]): Promise<NewsArticle[]> {
  if (!newsCache || Date.now() >= cacheExpiry) {
    const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
    const all: NewsArticle[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }

    // Deduplicate by title similarity, sort newest first
    const seen = new Set<string>();
    const deduped = all.filter(a => {
      const key = a.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    deduped.sort((a, b) => b.publishedDate.getTime() - a.publishedDate.getTime());
    newsCache = deduped.slice(0, 80);
    cacheExpiry = Date.now() + 5 * 60 * 1000;
    console.log(`[News] Fetched ${newsCache.length} articles from ${RSS_FEEDS.length} feeds`);
  }

  if (!instruments || instruments.length === 0) return newsCache;

  // Filter to articles matching any of the requested instruments
  return newsCache.filter(a =>
    a.instruments.some(inst => instruments.includes(inst))
  );
}

export function invalidateNewsCache() {
  newsCache = null;
  cacheExpiry = 0;
}
