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
 * - crypto-price-fetchers' GeckoTerminal client asks for the candles and
 *   finds each time's price (`crypto-price-fetchers/dex-prices/geckoterminal`).
 *   It asks a thousand hours at a time, newest first, back from the latest
 *   time to a day before the earliest, or to the pool's first candle, as
 *   far back as GeckoTerminal's public api serves: it answers a request
 *   only when its before-time is within the last 180 days, so the client
 *   asks its last page a day inside that edge, and that page reaches a
 *   thousand hourly candles further back, to about 220 days ago, more
 *   where hours went without a trade. It
 *   keeps within its budget of requests, and sends a request GeckoTerminal
 *   refuses as too many (429) again after its waits.
 */

import {
  fetchCandles,
  geckoTerminalSettings,
  priceAt,
} from "crypto-price-fetchers/dex-prices/geckoterminal";

/** How long before a time its candle may open and still give its price, in seconds: a day. */
export const MAX_CANDLE_AGE_SECONDS = 24 * 60 * 60;

/**
 * Where and how GeckoTerminal is asked for the pool's candles.
 *
 * @typedef {Object} XntPriceSource
 * @property {string} network - GeckoTerminal's id for the chain, such as 'x1-network'
 * @property {string} pool - The pool's address
 * @property {string} xntToken - The address of XNT's wrapped mint
 * @property {string} usdToken - The address of the USD stablecoin's mint
 * @property {Object} settings - How the client asks (`geckoTerminalSettings`)
 */

/**
 * Completes where and how GeckoTerminal is asked: the pool and its two
 * tokens, with the client's settings, which fill in Node's fetch, real
 * waits, the waits after a 429, and the process's budget of requests,
 * wherever none is given.
 *
 * @param {Object} source - Where to ask
 * @param {string} source.apiUrl - GeckoTerminal's api, such as the client's `GECKO_TERMINAL_API_URL`
 * @param {string} source.network - GeckoTerminal's id for the chain, such as 'x1-network'
 * @param {string} source.pool - The pool's address
 * @param {string} source.xntToken - The address of XNT's wrapped mint
 * @param {string} source.usdToken - The address of the USD stablecoin's mint
 * @param {function(string, Object): Promise<Response>} [source.fetch] - Fetches a url, in place of Node's fetch
 * @param {function(number): Promise<void>} [source.sleep] - Waits a number of milliseconds
 * @param {number[]} [source.retryDelaysMs] - The waits before each new try after a 429
 * @param {function(): number} [source.now] - The clock, in milliseconds, that the budget and the public api's 180 days are counted by
 * @param {number[]} [source.requestLog] - The record of recent requests that the budget counts
 * @returns {XntPriceSource} The completed source, as `fetchHourlyCandles` takes it
 */
export function geckoTerminalSource({
  network,
  pool,
  xntToken,
  usdToken,
  ...requests
}) {
  return {
    network,
    pool,
    xntToken,
    usdToken,
    settings: geckoTerminalSettings(requests),
  };
}

/**
 * Checks that the pool pairs XNT with the stablecoin, in either order.
 *
 * @param {{base: (string|null), quote: (string|null)}} pair - The pool's two tokens, as GeckoTerminal names them
 * @param {XntPriceSource} source - Where it was asked
 * @throws {Error} When the pool does not pair XNT with the stablecoin
 */
function checkPair({ base, quote }, source) {
  const pair = [base, quote];
  if (pair.includes(source.xntToken) && pair.includes(source.usdToken)) return;
  throw new Error(
    `Pool ${source.pool} does not pair XNT (${source.xntToken}) with the USD stablecoin (${source.usdToken})`,
  );
}

/**
 * Asks GeckoTerminal for the pool's hourly candles of XNT in the
 * stablecoin, from a day before the earliest time to the latest time, or
 * from the pool's first candle, once its pair is checked.
 *
 * @param {XntPriceSource} source - Where and how to ask (`geckoTerminalSource`)
 * @param {number} earliestSeconds - The earliest time that needs a price, in unix seconds
 * @param {number} latestSeconds - The latest time that needs a price, in unix seconds
 * @returns {Promise<Array<number[]>>} The candles, as [open time in unix seconds, open, high, low, close, volume], oldest first
 * @throws {Error} When GeckoTerminal cannot give them, or the pool does not pair XNT with the stablecoin
 */
export async function fetchHourlyCandles(
  source,
  earliestSeconds,
  latestSeconds,
) {
  const { candles, base, quote } = await fetchCandles(
    {
      network: source.network,
      pool: source.pool,
      timeframe: "hour",
      currency: "token",
      token: source.xntToken,
    },
    earliestSeconds - MAX_CANDLE_AGE_SECONDS,
    latestSeconds,
    source.settings,
  );
  if (candles.length > 0) checkPair({ base, quote }, source);
  return candles;
}

/**
 * Prices each time from the pool's hourly candles.
 *
 * @param {number[]} timestamps - The times, in unix seconds
 * @param {XntPriceSource} source - Where and how to ask (`geckoTerminalSource`)
 * @returns {Promise<{prices: Array<number|null>, earliestCandleSeconds: (number|null)}>} Each time's
 *   price in USD per XNT, or null where there is none, and the open time of the earliest candle given
 * @throws {Error} When GeckoTerminal cannot give the candles
 */
export async function priceTimes(timestamps, source) {
  if (timestamps.length === 0)
    return { prices: [], earliestCandleSeconds: null };
  const candles = await fetchHourlyCandles(
    source,
    Math.min(...timestamps),
    Math.max(...timestamps),
  );
  return {
    prices: timestamps.map((timestamp) =>
      priceAt(candles, timestamp, MAX_CANDLE_AGE_SECONDS),
    ),
    earliestCandleSeconds: candles.length > 0 ? candles[0][0] : null,
  };
}
