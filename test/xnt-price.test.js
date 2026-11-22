/**
 * Tests of xnt-price.js: XNT's USD price at a time, from GeckoTerminal's
 * hourly candles, asked through crypto-price-fetchers' GeckoTerminal
 * client of a stand-in GeckoTerminal, through a stand-in fetch, so they
 * ask nothing outside the computer.
 * @module test/xnt-price.test
 *
 * Each source has a clock and a record of requests of its own, so the
 * public api's 180 days are counted from a fixed time and no test's
 * requests count against another's budget.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RETRY_DELAYS_MS } from "crypto-price-fetchers/dex-prices/web-request";
import {
  MAX_CANDLE_AGE_SECONDS,
  fetchHourlyCandles,
  geckoTerminalSource,
  priceTimes,
} from "../xnt-price.js";
import {
  HIGH_SHARE,
  LOW_SHARE,
  OPEN_SHARE,
  POOL,
  USDC_X,
  XNT,
  standInGeckoFetch,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";

const HOUR = 3600;

/** The first candle's open time: 04:00 UTC on 2026-10-01. */
const T0 = Date.UTC(2026, 9, 1, 4, 0, 0) / 1000;

/** The time the tests' clock gives: a hundred days after T0, in milliseconds. */
const NOW_MS = (T0 + 100 * 24 * HOUR) * 1000;

/**
 * Hourly candles from T0, each with a price of its own.
 *
 * @param {number} count - How many
 * @returns {Array<Array<number>>} The candles, as [open time, price], oldest first
 */
function candlesFrom(count) {
  return Array.from({ length: count }, (_, index) => [
    T0 + index * HOUR,
    0.2 + index / 100000,
  ]);
}

/**
 * The candles as the client gives them, from the stand-in's: [open time,
 * open, high, low, close, volume], each closing at its own price, with the
 * open, high and low the stand-in gives apart from it.
 *
 * @param {Array<Array<number>>} candles - Candles, as [open time, price]
 * @returns {Array<Array<number>>} The client's candles
 */
function asGiven(candles) {
  return candles.map(([open, price]) => [
    open,
    price * OPEN_SHARE,
    price * HIGH_SHARE,
    price * LOW_SHARE,
    price,
    100,
  ]);
}

/**
 * A source that asks a stand-in GeckoTerminal, with its own clock and
 * record of requests, and records each wait instead of waiting.
 *
 * @param {Object} gecko - The stand-in GeckoTerminal
 * @param {Object} [overrides] - Settings in place of the test's own
 * @returns {{source: Object, waits: number[]}} The source, and the waits it asked for, in milliseconds
 */
function sourceFor(gecko, overrides = {}) {
  const waits = [];
  const source = geckoTerminalSource({
    apiUrl: "https://gecko.stand-in.test",
    network: "x1-network",
    pool: POOL,
    xntToken: XNT,
    usdToken: USDC_X,
    fetch: standInGeckoFetch(gecko),
    sleep: async (ms) => {
      waits.push(ms);
    },
    retryDelaysMs: [11, 22],
    now: () => NOW_MS,
    requestLog: [],
    ...overrides,
  });
  return { source, waits };
}

describe("fetchHourlyCandles", () => {
  it("asks for hourly candles of XNT in the pool's own rate, from the latest time back", async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(48) });
    const latest = T0 + 47 * HOUR + 1800;

    await fetchHourlyCandles(sourceFor(gecko).source, T0 + 30 * HOUR, latest);

    const url = new URL(gecko.asked[0]);
    assert.equal(
      `${url.origin}${url.pathname}`,
      `https://gecko.stand-in.test/networks/x1-network/pools/${POOL}/ohlcv/hour`,
    );
    assert.equal(url.searchParams.get("currency"), "token");
    assert.equal(url.searchParams.get("token"), XNT);
    assert.equal(url.searchParams.get("limit"), "1000");
    assert.equal(url.searchParams.get("aggregate"), "1");
    assert.ok(Number(url.searchParams.get("before_timestamp")) > latest);
  });

  it("gives the candles from a day before the earliest time to the latest, oldest first", async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(2500) });

    const candles = await fetchHourlyCandles(
      sourceFor(gecko).source,
      T0 + 2000 * HOUR,
      T0 + 2499 * HOUR,
    );

    assert.equal(gecko.asked.length, 1);
    assert.deepEqual(candles, asGiven(candlesFrom(2500).slice(1976)));
  });

  it("pages back a thousand hours at a time to the pool's first candle", async () => {
    const all = candlesFrom(2500);
    const gecko = standInGeckoTerminal({ candles: all });

    const candles = await fetchHourlyCandles(
      sourceFor(gecko).source,
      T0,
      T0 + 2499 * HOUR,
    );

    assert.deepEqual(candles, asGiven(all));
    assert.equal(gecko.asked.length, 3);
  });

  it("gives no candles for times before the first", async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(3) });
    assert.deepEqual(
      await fetchHourlyCandles(
        sourceFor(gecko).source,
        T0 - 10 * HOUR,
        T0 - HOUR,
      ),
      [],
    );
  });

  it("sends a request again after each refusal as too many, waiting as told", async () => {
    const gecko = standInGeckoTerminal({
      candles: candlesFrom(10),
      refusals: [429, 429],
    });
    const { source, waits } = sourceFor(gecko);

    const candles = await fetchHourlyCandles(source, T0, T0 + 9 * HOUR);

    assert.equal(candles.length, 10);
    assert.equal(gecko.asked.length, 3);
    assert.deepEqual(waits, [11, 22]);
  });

  it("gives up once the waits run out", async () => {
    const gecko = standInGeckoTerminal({
      candles: candlesFrom(10),
      refusals: [429, 429, 429],
    });
    await assert.rejects(
      fetchHourlyCandles(sourceFor(gecko).source, T0, T0 + 9 * HOUR),
      /GeckoTerminal answered 429 for/,
    );
    assert.equal(gecko.asked.length, 3);
  });

  it("does not send a request again after another error", async () => {
    const gecko = standInGeckoTerminal({
      candles: candlesFrom(10),
      refusals: [500],
    });
    const { source, waits } = sourceFor(gecko);
    await assert.rejects(
      fetchHourlyCandles(source, T0, T0 + 9 * HOUR),
      /GeckoTerminal answered 500 for/,
    );
    assert.deepEqual(waits, []);
  });

  it("refuses a pool that does not pair XNT with the USD stablecoin", async () => {
    const gecko = standInGeckoTerminal({
      candles: candlesFrom(10),
      pair: [XNT, "OtherToken111111111111111111111111111111111"],
    });
    await assert.rejects(
      fetchHourlyCandles(sourceFor(gecko).source, T0, T0 + 9 * HOUR),
      /does not pair XNT \(So1+2\) with the USD stablecoin/,
    );
  });

  it("takes the pair in either order", async () => {
    const gecko = standInGeckoTerminal({
      candles: candlesFrom(3),
      pair: [USDC_X, XNT],
    });
    assert.deepEqual(
      await fetchHourlyCandles(sourceFor(gecko).source, T0, T0 + 2 * HOUR),
      asGiven(candlesFrom(3)),
    );
  });
});

describe("priceTimes", () => {
  it("prices each time, and gives the earliest candle", async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(48) });

    const found = await priceTimes(
      [T0 - HOUR, T0 + 1800, T0 + 47 * HOUR],
      sourceFor(gecko).source,
    );

    assert.deepEqual(found, {
      prices: [null, 0.2, 0.2 + 47 / 100000],
      earliestCandleSeconds: T0,
    });
  });

  it("gives the close of the last earlier candle for an hour that has none", async () => {
    const gecko = standInGeckoTerminal({
      candles: [
        [T0, 0.25],
        [T0 + HOUR, 0.26],
        [T0 + 3 * HOUR, 0.28],
      ],
    });

    const found = await priceTimes(
      [T0 + HOUR + 1800, T0 + 2 * HOUR + 600],
      sourceFor(gecko).source,
    );

    assert.deepEqual(found.prices, [0.26, 0.26]);
  });

  it("gives no price once the last earlier candle opened a day or more before", async () => {
    const gecko = standInGeckoTerminal({
      candles: [
        [T0, 0.25],
        [T0 + 3 * HOUR, 0.28],
      ],
    });

    const found = await priceTimes(
      [
        T0 + 3 * HOUR + MAX_CANDLE_AGE_SECONDS - 1,
        T0 + 3 * HOUR + MAX_CANDLE_AGE_SECONDS,
      ],
      sourceFor(gecko).source,
    );

    assert.deepEqual(found.prices, [0.28, null]);
  });

  it("prices a time up to about 220 days before the clock, from the page asked at the edge of the public api's 180 days, and none older", async () => {
    const DAY = 24 * HOUR;
    const nowSeconds = T0 + 400 * DAY;
    const gecko = standInGeckoTerminal({
      candles: candlesFrom(400 * 24),
      publicSince: nowSeconds - 180 * DAY,
    });

    const found = await priceTimes(
      [nowSeconds - 225 * DAY, nowSeconds - 200 * DAY],
      sourceFor(gecko, { now: () => nowSeconds * 1000 }).source,
    );

    assert.deepEqual(found.prices, [null, 0.2 + (200 * 24) / 100000]);
    assert.equal(gecko.asked.length, 1);
  });

  it("asks nothing when there are no times", async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(3) });
    assert.deepEqual(await priceTimes([], sourceFor(gecko).source), {
      prices: [],
      earliestCandleSeconds: null,
    });
    assert.equal(gecko.asked.length, 0);
  });
});

describe("geckoTerminalSource", () => {
  it("keeps the pool and its tokens, and fills in the client's fetch, real waits and waits after a 429", async () => {
    const source = geckoTerminalSource({
      apiUrl: "https://gecko.stand-in.test",
      network: "x1-network",
      pool: POOL,
      xntToken: XNT,
      usdToken: USDC_X,
    });
    assert.equal(source.pool, POOL);
    assert.equal(source.xntToken, XNT);
    assert.equal(source.usdToken, USDC_X);
    assert.equal(source.settings.apiUrl, "https://gecko.stand-in.test");
    assert.equal(typeof source.settings.fetch, "function");
    assert.deepEqual(source.settings.retryDelaysMs, RETRY_DELAYS_MS);
    const started = Date.now();
    await source.settings.sleep(20);
    assert.ok(Date.now() - started >= 15);
  });
});
