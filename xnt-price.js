/**
 * @fileoverview
 * The USD price of XNT at each reward's time, from GeckoTerminal's hourly
 * candles for a pool that pairs XNT with a USD stablecoin.
 *
 * What: a time's price is the close of the last hourly candle that opened
 * at or before it, less than a day before it. A time with no such candle,
 * such as one before the pool's first candle, gets no price, never a
 * stand-in figure. GeckoTerminal's X1 candles start on 2026-10-01.
 *
 * How:
 *
 * - The candles are asked in the pool's own exchange rate, XNT in the
 *   stablecoin (`currency=token`), never in GeckoTerminal's USD
 *   (`currency=usd`). GeckoTerminal converts X1 prices to USD at one fixed
 *   rate for XNT, so its USD candles for XNT never move: every hour of the
 *   default pool's history gave $0.26583 there on 2026-11-16, while the
 *   pool's own rate went from about 0.25 on 2026-10-01 to about 0.19. The
 *   stablecoin, USDC.X on the default pool, is taken at $1.
 * - The answer's pair is checked: the pool must pair XNT with the
 *   stablecoin, in either order.
 * - The candles are asked newest first, a thousand hours at a time, back
 *   from the latest time to a day before the earliest, or to the pool's
 *   first candle, with a pause between requests. A request GeckoTerminal
 *   refuses as too many (429) is tried again after a wait.
 */

/** GeckoTerminal's public api, which needs no key. */
export const GECKO_TERMINAL_API_URL = 'https://api.geckoterminal.com/api/v2';

/** How long before a time its candle may open and still give its price, in seconds: a day. */
export const MAX_CANDLE_AGE_SECONDS = 24 * 60 * 60;

/** The most candles GeckoTerminal gives in one answer. */
const CANDLES_PER_REQUEST = 1000;

/** The waits before each new try of a request refused as too many, in milliseconds. */
const RETRY_DELAYS_MS = Object.freeze([5000, 15000, 30000, 60000]);

/** The pause between two requests for candles, in milliseconds. */
const PAGE_DELAY_MS = 2000;

/** How long one request may take, in milliseconds. */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Completes where and how GeckoTerminal is asked, with Node's fetch, real
 * waits, and the waits and pause above, unless given.
 *
 * @param {Object} settings - Where to ask
 * @param {string} settings.apiUrl - GeckoTerminal's api, such as `GECKO_TERMINAL_API_URL`
 * @param {string} settings.network - GeckoTerminal's id for the chain, such as 'x1-network'
 * @param {string} settings.pool - The pool's address
 * @param {string} settings.xntToken - The address of XNT's wrapped mint
 * @param {string} settings.usdToken - The address of the USD stablecoin's mint
 * @param {function(string, Object): Promise<Response>} [settings.fetch] - Fetches a url, in place of Node's fetch
 * @param {function(number): Promise<void>} [settings.sleep] - Waits a number of milliseconds
 * @param {number[]} [settings.retryDelaysMs] - The waits before each new try after a 429
 * @param {number} [settings.pageDelayMs] - The pause between two requests
 * @returns {Object} The completed settings, as `fetchHourlyCandles` takes them
 */
export function geckoTerminalSource(settings) {
  return {
    fetch: (url, options) => fetch(url, options),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    retryDelaysMs: RETRY_DELAYS_MS,
    pageDelayMs: PAGE_DELAY_MS,
    ...settings
  };
}

/**
 * The price at a time: the close of the last candle that opened at or
 * before it, less than a day before it.
 *
 * @param {Array<Array<number>>} candles - Candles as [open time in unix seconds, close], oldest first
 * @param {number} timestamp - The time, in unix seconds
 * @returns {number|null} The price, or null when no candle qualifies
 */
export function priceAt(candles, timestamp) {
  let low = 0;
  let high = candles.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (candles[middle][0] <= timestamp) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found === -1) return null;
  const [open, close] = candles[found];
  return timestamp - open < MAX_CANDLE_AGE_SECONDS ? close : null;
}

/**
 * Asks GeckoTerminal for up to a thousand hourly candles that opened at or
 * before a time, trying again after a wait when it refuses as too many.
 *
 * @param {Object} source - Where and how to ask (`geckoTerminalSource`)
 * @param {number} beforeSeconds - The latest open time asked, in unix seconds
 * @returns {Promise<Object>} GeckoTerminal's answer
 * @throws {Error} When GeckoTerminal answers with an error
 */
async function fetchCandlePage(source, beforeSeconds) {
  const url =
    `${source.apiUrl}/networks/${source.network}/pools/${source.pool}/ohlcv/hour` +
    `?aggregate=1&limit=${CANDLES_PER_REQUEST}&before_timestamp=${beforeSeconds}` +
    `&currency=token&token=${source.xntToken}`;
  for (let attempt = 0; ; attempt++) {
    const response = await source.fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (response.status === 429 && attempt < source.retryDelaysMs.length) {
      await source.sleep(source.retryDelaysMs[attempt]);
      continue;
    }
    if (!response.ok) {
      throw new Error(`GeckoTerminal answered ${response.status} for pool ${source.pool}`);
    }
    return response.json();
  }
}

/**
 * Reads the candles from GeckoTerminal's answer, as [open time, close],
 * once its pair is checked.
 *
 * @param {Object} answer - GeckoTerminal's answer
 * @param {Object} source - Where it was asked (`geckoTerminalSource`)
 * @returns {Array<Array<number>>} The candles, newest first
 * @throws {Error} When the answer has no candle list, or its pool does not pair XNT with the stablecoin
 */
function candlesOf(answer, source) {
  const list = answer?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) throw new Error(`GeckoTerminal gave no candle list for pool ${source.pool}`);
  if (list.length === 0) return [];
  const pair = [answer?.meta?.base?.address, answer?.meta?.quote?.address];
  if (!pair.includes(source.xntToken) || !pair.includes(source.usdToken)) {
    throw new Error(
      `Pool ${source.pool} does not pair XNT (${source.xntToken}) with the USD stablecoin (${source.usdToken})`
    );
  }
  return list
    .map((candle) => [Number(candle[0]), Number(candle[4])])
    .filter(([open, close]) => Number.isFinite(open) && Number.isFinite(close) && close > 0);
}

/**
 * Asks GeckoTerminal for the pool's hourly candles from a day before the
 * earliest time to the latest time, or from the pool's first candle.
 *
 * @param {Object} source - Where and how to ask (`geckoTerminalSource`)
 * @param {number} earliestSeconds - The earliest time that needs a price, in unix seconds
 * @param {number} latestSeconds - The latest time that needs a price, in unix seconds
 * @returns {Promise<Array<Array<number>>>} The candles as [open time, close], oldest first
 * @throws {Error} When GeckoTerminal cannot give them
 */
export async function fetchHourlyCandles(source, earliestSeconds, latestSeconds) {
  const candles = [];
  let beforeSeconds = latestSeconds;
  for (;;) {
    const page = candlesOf(await fetchCandlePage(source, beforeSeconds), source);
    candles.push(...page);
    if (page.length < CANDLES_PER_REQUEST) break;
    const oldest = Math.min(...page.map(([open]) => open));
    if (oldest <= earliestSeconds - MAX_CANDLE_AGE_SECONDS) break;
    beforeSeconds = oldest - 1;
    await source.sleep(source.pageDelayMs);
  }
  return candles.sort((a, b) => a[0] - b[0]);
}

/**
 * Prices each time from the pool's hourly candles.
 *
 * @param {number[]} timestamps - The times, in unix seconds
 * @param {Object} source - Where and how to ask (`geckoTerminalSource`)
 * @returns {Promise<{prices: Array<number|null>, earliestCandleSeconds: (number|null)}>} Each time's
 *   price in USD per XNT, or null where there is none, and the open time of the earliest candle given
 * @throws {Error} When GeckoTerminal cannot give the candles
 */
export async function priceTimes(timestamps, source) {
  if (timestamps.length === 0) return { prices: [], earliestCandleSeconds: null };
  const candles = await fetchHourlyCandles(source, Math.min(...timestamps), Math.max(...timestamps));
  return {
    prices: timestamps.map((timestamp) => priceAt(candles, timestamp)),
    earliestCandleSeconds: candles.length > 0 ? candles[0][0] : null
  };
}
