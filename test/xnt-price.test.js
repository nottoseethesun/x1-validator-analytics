/**
 * Tests of xnt-price.js: XNT's USD price at a time, from GeckoTerminal's
 * hourly candles, asked of a stand-in GeckoTerminal through a stand-in
 * fetch, so they ask nothing outside the computer.
 * @module test/xnt-price.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CANDLE_AGE_SECONDS, fetchHourlyCandles, geckoTerminalSource, priceAt, priceTimes } from '../xnt-price.js';
import { POOL, USDC_X, XNT, standInGeckoFetch, standInGeckoTerminal } from './helpers/stand-in-gecko-terminal.js';

const HOUR = 3600;

/** The first candle's open time: 04:00 UTC on 2026-10-01. */
const T0 = Date.UTC(2026, 9, 1, 4, 0, 0) / 1000;

/**
 * Hourly candles from T0, each with a price of its own.
 *
 * @param {number} count - How many
 * @returns {Array<Array<number>>} The candles, as [open time, price], oldest first
 */
function candlesFrom(count) {
  return Array.from({ length: count }, (_, index) => [T0 + index * HOUR, 0.2 + index / 100000]);
}

/**
 * A source that asks a stand-in GeckoTerminal, and records each wait
 * instead of waiting.
 *
 * @param {Object} gecko - The stand-in GeckoTerminal
 * @param {Object} [overrides] - Settings in place of the test's own
 * @returns {{source: Object, waits: number[]}} The source, and the waits it asked for, in milliseconds
 */
function sourceFor(gecko, overrides = {}) {
  const waits = [];
  const source = geckoTerminalSource({
    apiUrl: 'https://gecko.stand-in.test',
    network: 'x1-network',
    pool: POOL,
    xntToken: XNT,
    usdToken: USDC_X,
    fetch: standInGeckoFetch(gecko),
    sleep: async (ms) => {
      waits.push(ms);
    },
    retryDelaysMs: [11, 22],
    pageDelayMs: 7,
    ...overrides
  });
  return { source, waits };
}

describe('priceAt', () => {
  const candles = [[T0, 0.25], [T0 + HOUR, 0.26], [T0 + 3 * HOUR, 0.28]];

  it('gives the close of the candle that holds the time', () => {
    assert.equal(priceAt(candles, T0), 0.25);
    assert.equal(priceAt(candles, T0 + HOUR + 1800), 0.26);
  });

  it('gives the close of the last earlier candle for an hour that has none', () => {
    assert.equal(priceAt(candles, T0 + 2 * HOUR + 600), 0.26);
  });

  it('gives no price before the first candle', () => {
    assert.equal(priceAt(candles, T0 - 1), null);
    assert.equal(priceAt([], T0), null);
  });

  it('gives no price once the last earlier candle opened a day or more before', () => {
    assert.equal(priceAt(candles, T0 + 3 * HOUR + MAX_CANDLE_AGE_SECONDS - 1), 0.28);
    assert.equal(priceAt(candles, T0 + 3 * HOUR + MAX_CANDLE_AGE_SECONDS), null);
  });
});

describe('fetchHourlyCandles', () => {
  it("asks for hourly candles in the pool's own rate, back from the latest time", async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(48) });
    const latest = T0 + 47 * HOUR + 1800;

    await fetchHourlyCandles(sourceFor(gecko).source, T0 + 30 * HOUR, latest);

    const url = new URL(gecko.asked[0]);
    assert.equal(`${url.origin}${url.pathname}`, `https://gecko.stand-in.test/networks/x1-network/pools/${POOL}/ohlcv/hour`);
    assert.equal(url.searchParams.get('currency'), 'token');
    assert.equal(url.searchParams.get('token'), XNT);
    assert.equal(url.searchParams.get('before_timestamp'), String(latest));
    assert.equal(url.searchParams.get('limit'), '1000');
    assert.equal(url.searchParams.get('aggregate'), '1');
  });

  it('pages back a thousand hours at a time to the first candle, pausing between requests', async () => {
    const all = candlesFrom(2500);
    const gecko = standInGeckoTerminal({ candles: all });
    const { source, waits } = sourceFor(gecko);

    const candles = await fetchHourlyCandles(source, T0, T0 + 2499 * HOUR);

    assert.deepEqual(candles, all);
    assert.deepEqual(
      gecko.asked.map((url) => Number(new URL(url).searchParams.get('before_timestamp'))),
      [T0 + 2499 * HOUR, T0 + 1500 * HOUR - 1, T0 + 500 * HOUR - 1]
    );
    assert.deepEqual(waits, [7, 7]);
  });

  it('stops once it has the candles from a day before the earliest time', async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(2500) });

    const candles = await fetchHourlyCandles(sourceFor(gecko).source, T0 + 2000 * HOUR, T0 + 2499 * HOUR);

    assert.equal(gecko.asked.length, 1);
    assert.equal(candles.length, 1000);
    assert.equal(candles[0][0], T0 + 1500 * HOUR);
  });

  it('gives no candles for times before the first', async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(3) });
    assert.deepEqual(await fetchHourlyCandles(sourceFor(gecko).source, T0 - 10 * HOUR, T0 - HOUR), []);
  });

  it('tries again after each refusal as too many, waiting as told', async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(10), refusals: [429, 429] });
    const { source, waits } = sourceFor(gecko);

    const candles = await fetchHourlyCandles(source, T0, T0 + 9 * HOUR);

    assert.equal(candles.length, 10);
    assert.equal(gecko.asked.length, 3);
    assert.deepEqual(waits, [11, 22]);
  });

  it('gives up once the waits run out', async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(10), refusals: [429, 429, 429] });
    await assert.rejects(fetchHourlyCandles(sourceFor(gecko).source, T0, T0 + 9 * HOUR), /GeckoTerminal answered 429 for pool/);
    assert.equal(gecko.asked.length, 3);
  });

  it('does not try again after another error', async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(10), refusals: [500] });
    const { source, waits } = sourceFor(gecko);
    await assert.rejects(fetchHourlyCandles(source, T0, T0 + 9 * HOUR), /GeckoTerminal answered 500 for pool/);
    assert.deepEqual(waits, []);
  });

  it('refuses a pool that does not pair XNT with the USD stablecoin', async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(10), pair: [XNT, 'OtherToken111111111111111111111111111111111'] });
    await assert.rejects(
      fetchHourlyCandles(sourceFor(gecko).source, T0, T0 + 9 * HOUR),
      /does not pair XNT \(So1+2\) with the USD stablecoin/
    );
  });

  it('takes the pair in either order', async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(3), pair: [USDC_X, XNT] });
    assert.deepEqual(await fetchHourlyCandles(sourceFor(gecko).source, T0, T0 + 2 * HOUR), candlesFrom(3));
  });
});

describe('priceTimes', () => {
  it('prices each time, and gives the earliest candle', async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(48) });

    const found = await priceTimes([T0 - HOUR, T0 + 1800, T0 + 47 * HOUR], sourceFor(gecko).source);

    assert.deepEqual(found, { prices: [null, 0.2, 0.2 + 47 / 100000], earliestCandleSeconds: T0 });
  });

  it('asks nothing when there are no times', async () => {
    const gecko = standInGeckoTerminal({ candles: candlesFrom(3) });
    assert.deepEqual(await priceTimes([], sourceFor(gecko).source), { prices: [], earliestCandleSeconds: null });
    assert.equal(gecko.asked.length, 0);
  });
});

describe('geckoTerminalSource', () => {
  it('fills in a fetch, real waits, a pause between requests and four more tries after a 429', async () => {
    const source = geckoTerminalSource({ apiUrl: 'https://gecko.stand-in.test', network: 'x1-network', pool: POOL, xntToken: XNT, usdToken: USDC_X });
    assert.equal(typeof source.fetch, 'function');
    assert.equal(source.retryDelaysMs.length, 4);
    assert.ok(source.pageDelayMs > 0);
    const started = Date.now();
    await source.sleep(20);
    assert.ok(Date.now() - started >= 15);
  });
});
