/**
 * A stand-in GeckoTerminal, for tests that price rewards without asking
 * the live api.
 * @module test/helpers/stand-in-gecko-terminal
 *
 * `standInGeckoTerminal` answers requests for one pool's hourly candles as
 * GeckoTerminal does: the candles that opened at or before
 * `before_timestamp`, newest first, up to `limit`, with the pool's pair in
 * `meta`. Asked in the pool's own exchange rate (`currency=token`), it gives
 * the test's candles; asked in USD (`currency=usd`), it gives GeckoTerminal's
 * fixed USD price for XNT at every hour, as the live api does for X1. A test
 * can have it refuse its first requests with given statuses. It records
 * each url asked.
 *
 * The same stand-in answers two ways: `standInGeckoFetch` gives a fetch for
 * code a test calls in its own process, and `serveStandInGeckoTerminal`
 * serves it on a free local port for the script run in a child process.
 */

import http from "node:http";

/** XNT's wrapped mint, the base token of the default pool. */
export const XNT = "So11111111111111111111111111111111111111112";

/** USDC.X's mint, the quote token of the default pool. */
export const USDC_X = "B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq";

/** The default pool, XDEX's WXNT / USDC.X. */
export const POOL = "CAJeVEoSm1QQZccnCqYu9cnNF7TTD2fcUA3E5HQoxRvR";

/** GeckoTerminal's fixed USD price for XNT, which its USD candles show at every hour. */
export const FIXED_USD_PRICE = 0.26583216633012297;

/**
 * Makes a stand-in GeckoTerminal for one pool.
 *
 * @param {Object} market - What it serves
 * @param {Array<Array<number>>} market.candles - Hourly candles as [open time in unix seconds, price of XNT in
 *   the pool's other token], in any order
 * @param {string} [market.pool=POOL] - The pool's address
 * @param {string[]} [market.pair=[XNT, USDC_X]] - The pool's base and quote tokens' addresses
 * @param {number[]} [market.refusals=[]] - Statuses to answer instead of candles, one per request, from the first
 * @param {boolean} [market.ignoresBefore=false] - Whether to answer the newest candles whatever `before_timestamp` says
 * @returns {{answer: function(string): {status: number, body: Object}, asked: string[]}} The stand-in
 */
export function standInGeckoTerminal({
  candles,
  pool = POOL,
  pair = [XNT, USDC_X],
  refusals = [],
  ignoresBefore = false,
}) {
  const pending = [...refusals];
  const asked = [];
  const answer = (href) => {
    asked.push(href);
    const url = new URL(href);
    if (url.pathname !== `/networks/x1-network/pools/${pool}/ohlcv/hour`) {
      return {
        status: 404,
        body: { errors: [{ status: "404", title: "Not Found" }] },
      };
    }
    if (pending.length > 0)
      return {
        status: pending.shift(),
        body: { status: { error_code: "refused" } },
      };
    const query = url.searchParams;
    const before = ignoresBefore
      ? Number.MAX_SAFE_INTEGER
      : Number(query.get("before_timestamp") ?? Number.MAX_SAFE_INTEGER);
    const limit = Number(query.get("limit") ?? 100);
    const priceOf = (price) => {
      if (query.get("currency") === "usd") return FIXED_USD_PRICE;
      return query.get("token") === XNT ? price : 1 / price;
    };
    const list = candles
      .filter(([open]) => open <= before)
      .sort((a, b) => b[0] - a[0])
      .slice(0, limit)
      .map(([open, price]) => [
        open,
        priceOf(price),
        priceOf(price),
        priceOf(price),
        priceOf(price),
        100,
      ]);
    const meta = { base: { address: pair[0] }, quote: { address: pair[1] } };
    return {
      status: 200,
      body: {
        data: {
          id: "stand-in",
          type: "ohlcv_request_response",
          attributes: { ohlcv_list: list },
        },
        meta,
      },
    };
  };
  return { answer, asked };
}

/**
 * A fetch that answers from a stand-in GeckoTerminal.
 *
 * @param {{answer: function(string): {status: number, body: Object}}} geckoTerminal - The stand-in
 * @returns {function(string): Promise<Response>} The fetch
 */
export function standInGeckoFetch(geckoTerminal) {
  return async (url) => {
    const { status, body } = geckoTerminal.answer(String(url));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

/**
 * Serves a stand-in GeckoTerminal on a free port of 127.0.0.1.
 *
 * @param {{answer: function(string): {status: number, body: Object}}} geckoTerminal - The stand-in
 * @returns {Promise<{url: string, close: function(): Promise<void>}>} Its api url, and a way to stop it
 */
export function serveStandInGeckoTerminal(geckoTerminal) {
  const server = http.createServer((request, response) => {
    const { status, body } = geckoTerminal.answer(
      `http://${request.headers.host}${request.url}`,
    );
    response.statusCode = status;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(body));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
