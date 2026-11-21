/**
 * Tests of fetch-total-validator-earnings.js, the real script, run in a
 * child process against a stand-in X1 endpoint and a stand-in
 * GeckoTerminal, so they ask nothing outside the computer.
 * @module test/fetch-total-validator-earnings.test
 *
 * Each reward pays 1.234567891 XNT, so an amount rounded to fewer than
 * nine decimal places shows. The stand-in GeckoTerminal's candles put a
 * price apart from its neighbours' on the hour of each reward priced, so a
 * reward priced from the wrong hour shows too, and it gives a fixed USD
 * price, as GeckoTerminal does for X1, to a script that asks in USD, so
 * that shows as well.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startStandInX1, rewardSeconds } from "./helpers/stand-in-x1.js";
import {
  XNT,
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";
import { metric, runScript, VOTE_PUBKEY } from "./helpers/run-script.js";

const REWARD_LAMPORTS = 1234567891;
const HOUR = 3600;

/** The stand-in chain's time: 12:00 UTC on 2026-11-10. */
const NOW_SECONDS = Date.UTC(2026, 10, 10, 12, 0, 0) / 1000;

/**
 * The open time of the hourly candle that holds a time.
 *
 * @param {number} seconds - The time, in unix seconds
 * @returns {number} The hour's start, in unix seconds
 */
function hourOf(seconds) {
  return Math.floor(seconds / HOUR) * HOUR;
}

/**
 * Hourly candles at one price, from one hour to another.
 *
 * @param {number} fromHour - The first candle's open time
 * @param {number} toHour - The last candle's open time
 * @param {number} price - Each candle's price
 * @returns {Array<Array<number>>} The candles, as [open time, price]
 */
function flatCandles(fromHour, toHour, price) {
  const candles = [];
  for (let open = fromHour; open <= toHour; open += HOUR)
    candles.push([open, price]);
  return candles;
}

/**
 * Asks a json-rpc endpoint for its epoch, as the script does.
 *
 * @param {string} url - The endpoint's url
 * @returns {Promise<{absoluteSlot: number, slotIndex: number}>} The answer to getEpochInfo
 */
async function epochInfo(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getEpochInfo" }),
  });
  return (await response.json()).result;
}

/**
 * Starts the two stand-ins.
 *
 * @param {Object} chainSettings - The stand-in chain's settings, beyond the vote account, reward and time
 * @param {function(Object): Object} marketFor - Makes the stand-in GeckoTerminal's market from the chain's settings
 * @returns {Promise<{x1: Object, gecko: Object, server: Object, close: function(): Promise<void>}>} The stand-ins
 */
async function startStandIns(chainSettings, marketFor) {
  const x1 = await startStandInX1({
    votePubkey: VOTE_PUBKEY,
    rewardLamports: REWARD_LAMPORTS,
    nowSeconds: NOW_SECONDS,
    ...chainSettings,
  });
  const gecko = standInGeckoTerminal(marketFor(x1.chain));
  const server = await serveStandInGeckoTerminal(gecko);
  return {
    x1,
    gecko,
    server,
    close: async () => Promise.all([x1.close(), server.close()]),
  };
}

describe("fetch-total-validator-earnings.js, three recent epochs, all priced", () => {
  let standIns;
  let run;

  before(async () => {
    standIns = await startStandIns({}, (chain) => {
      const marked = new Map(
        [497, 498, 499].map((epoch, index) => [
          hourOf(rewardSeconds(chain, epoch)),
          0.25 + index * 0.05,
        ]),
      );
      const candles = flatCandles(
        hourOf(rewardSeconds(chain, 497)) - 48 * HOUR,
        hourOf(rewardSeconds(chain, 499)) + HOUR,
        0.2,
      );
      return {
        candles: candles.map(([open, price]) => [
          open,
          marked.get(open) ?? price,
        ]),
      };
    });
    run = await runScript({
      rpcUrl: standIns.x1.url,
      geckoTerminalUrl: standIns.server.url,
      args: ["--epochs", "3"],
    });
  });

  after(async () => {
    if (standIns !== undefined) await standIns.close();
  });

  it("exits with code 0 and writes one row per epoch, oldest first", () => {
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(
      run.rows.map((row) => row.Epoch),
      ["497", "498", "499"],
    );
  });

  it("keeps all nine decimal places of each amount and of the running total", () => {
    assert.deepEqual(
      run.rows.map((row) => row["XNT Amount"]),
      ["1.234567891", "1.234567891", "1.234567891"],
    );
    assert.deepEqual(
      run.rows.map((row) => row["Cumulative XNT"]),
      ["1.234567891", "2.469135782", "3.703703673"],
    );
    assert.equal(metric(run.analytics, "Total XNT Earned"), "3.703703673");
  });

  it("prices each reward at the close of its own hour's candle, in the pool's own rate", () => {
    assert.deepEqual(
      run.rows.map((row) => row["XNT Price (USD)"]),
      ["0.250000", "0.300000", "0.350000"],
    );
    assert.ok(standIns.gecko.asked.length > 0);
    assert.ok(
      standIns.gecko.asked.every((url) => {
        const query = new URL(url).searchParams;
        return query.get("currency") === "token" && query.get("token") === XNT;
      }),
    );
  });

  it("values each reward at its amount times its price, and keeps the running total", () => {
    assert.deepEqual(
      run.rows.map((row) => row["Value (USD)"]),
      ["0.3086", "0.3704", "0.4321"],
    );
    assert.deepEqual(
      run.rows.map((row) => row["Cumulative USD"]),
      ["0.3086", "0.6790", "1.1111"],
    );
  });

  it("values no reward at the $1.00 fallback price", () => {
    assert.equal(
      run.rows.filter((row) => row["XNT Price (USD)"] === "1.000000").length,
      0,
    );
  });

  it("warns of no unpriced reward, and counts none", () => {
    assert.doesNotMatch(run.stderr, /no XNT price/);
    assert.equal(metric(run.analytics, "Rewards Without an XNT Price"), "0");
    assert.equal(metric(run.analytics, "Unexpected Failed Epoch Queries"), "0");
  });
});

describe("fetch-total-validator-earnings.js, given a wrong option", () => {
  for (const [args, option] of [
    [["--vote-pubkey", "abc"], "--vote-pubkey <pubkey>"],
    [["--vote-pubkey", "0OIl" + "1".repeat(40)], "--vote-pubkey <pubkey>"],
    [["--liquidity-pool-address", "not-a-key"], "--liquidity-pool-address"],
    [["--rpc-url", "notaurl"], "--rpc-url <url>"],
    [["--rpc-url", "ftp://example.com"], "--rpc-url <url>"],
  ]) {
    it(`refuses ${args.join(" ")} with exit code 1, naming the option, before it asks anything`, async () => {
      const run = await runScript({
        rpcUrl: "http://127.0.0.1:1",
        geckoTerminalUrl: "http://127.0.0.1:1",
        args,
      });
      assert.equal(run.code, 1);
      assert.match(run.stderr, /argument '.*' is invalid/);
      assert.ok(run.stderr.includes(option), run.stderr);
      assert.doesNotMatch(run.stderr, /ECONNREFUSED/);
    });
  }
});

describe("fetch-total-validator-earnings.js, in verbose mode", () => {
  let standIns;
  let run;

  before(async () => {
    standIns = await startStandIns({}, (chain) => ({
      candles: flatCandles(
        hourOf(rewardSeconds(chain, 497)) - 48 * HOUR,
        hourOf(rewardSeconds(chain, 499)) + HOUR,
        0.2,
      ),
    }));
    run = await runScript({
      rpcUrl: standIns.x1.url,
      geckoTerminalUrl: standIns.server.url,
      args: ["--epochs", "3", "--verbose"],
    });
  });

  after(async () => {
    if (standIns !== undefined) await standIns.close();
  });

  it("finds every reward while it prints each epoch's raw answer", () => {
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(
      run.rows.map((row) => row.Epoch),
      ["497", "498", "499"],
    );
    assert.match(run.stdout, /Raw response for epoch 499:/);
    assert.doesNotMatch(run.stdout, /Failed to query epoch/);
    assert.doesNotMatch(run.stderr, /Failed to query epoch/);
  });

  it("prints the chain's numbers as numbers", () => {
    assert.match(run.stdout, /RPC Health - Current Epoch: 500\n/);
    assert.match(run.stdout, /Absolute Slot: \d+\n/);
  });

  it("prints the current epoch's first slot, its absolute slot less its index in the epoch", async () => {
    const { absoluteSlot, slotIndex } = await epochInfo(standIns.x1.url);
    assert.ok(
      run.stdout.includes(`Epoch Start Slot: ${absoluteSlot - slotIndex}\n`),
      run.stdout,
    );
  });
});

describe("fetch-total-validator-earnings.js, full history, with prices from midway", () => {
  let standIns;
  let run;

  before(async () => {
    // Epochs 0 to 15 fail, as X1's do after its rollback; candles start after epoch 19's reward
    standIns = await startStandIns(
      { currentEpoch: 30, failEpochsThrough: 15 },
      (chain) => ({
        candles: flatCandles(
          hourOf(rewardSeconds(chain, 19)) + HOUR,
          hourOf(rewardSeconds(chain, 29)) + HOUR,
          0.2,
        ),
      }),
    );
    run = await runScript({
      rpcUrl: standIns.x1.url,
      geckoTerminalUrl: standIns.server.url,
      args: ["--json"],
    });
  });

  after(async () => {
    if (standIns !== undefined) await standIns.close();
  });

  it("exits with code 0 and writes a row for each epoch from 16 to 29", () => {
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(
      run.rows.map((row) => Number(row.Epoch)),
      Array.from({ length: 14 }, (_, index) => 16 + index),
    );
  });

  it("counts the failures of epochs 0 to 15 as expected, and no others", () => {
    assert.equal(metric(run.analytics, "Total Epochs Processed"), "30");
    assert.equal(
      metric(run.analytics, "Early Epoch Failures (expected from rollback)"),
      "16",
    );
    assert.equal(metric(run.analytics, "Unexpected Failed Epoch Queries"), "0");
    assert.equal(metric(run.analytics, "Total Epochs with Rewards"), "14");
  });

  it("leaves the price and value of each reward before the first candle empty, never $1.00", () => {
    const unpriced = run.rows.slice(0, 4);
    assert.ok(
      unpriced.every(
        (row) => row["XNT Price (USD)"] === "" && row["Value (USD)"] === "",
      ),
    );
    assert.ok(
      run.rows
        .slice(4)
        .every(
          (row) =>
            row["XNT Price (USD)"] === "0.200000" &&
            row["Value (USD)"] === "0.2469",
        ),
    );
    assert.equal(metric(run.analytics, "Rewards Without an XNT Price"), "4");
  });

  it("warns of the unpriced rewards", () => {
    assert.match(run.stderr, /Warning: 4 of 14 rewards have no XNT price/);
  });

  it("leaves the unpriced rewards out of the running USD total, and keeps every XNT", () => {
    assert.deepEqual(
      run.rows.slice(0, 5).map((row) => row["Cumulative USD"]),
      ["0.0000", "0.0000", "0.0000", "0.0000", "0.2469"],
    );
    assert.equal(run.rows.at(-1)["Cumulative USD"], "2.4690");
    assert.equal(run.rows.at(-1)["Cumulative XNT"], "17.283950474");
    assert.equal(metric(run.analytics, "Total XNT Earned"), "17.283950474");
  });

  it("writes the same rewards to the json export, with null where there is no price", () => {
    assert.equal(run.json.rewards.length, 14);
    assert.deepEqual(run.json.rewards[0], {
      epoch: 16,
      rewardDate: run.rows[0]["Reward Date (UTC, approx)"],
      xntAmount: "1.234567891",
      cumulativeXNT: "1.234567891",
      priceUSD: null,
      valueUSD: null,
      cumulativeUSD: "0.0000",
    });
    assert.equal(run.json.rewards.at(-1).priceUSD, "0.200000");
    assert.equal(run.json.metadata.rewardsWithoutPrice, 4);
  });

  it("writes the same metrics to the analytics json as to the analytics csv", () => {
    assert.deepEqual(
      run.analyticsJson.map(({ Metric, Value }) => [Metric, String(Value)]),
      run.analytics.map(({ Metric, Value }) => [Metric, Value]),
    );
  });
});

describe("fetch-total-validator-earnings.js, when GeckoTerminal cannot give prices", () => {
  let standIns;
  let run;

  before(async () => {
    standIns = await startStandIns({}, (chain) => ({
      candles: flatCandles(
        hourOf(rewardSeconds(chain, 498)),
        hourOf(rewardSeconds(chain, 499)),
        0.2,
      ),
      refusals: [500],
    }));
    run = await runScript({
      rpcUrl: standIns.x1.url,
      geckoTerminalUrl: standIns.server.url,
      args: ["--epochs", "2"],
    });
  });

  after(async () => {
    if (standIns !== undefined) await standIns.close();
  });

  it("still writes every reward, with empty price and value cells, and exits with code 0", () => {
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.rows.length, 2);
    assert.ok(
      run.rows.every(
        (row) =>
          row["XNT Price (USD)"] === "" &&
          row["Value (USD)"] === "" &&
          row["Cumulative USD"] === "0.0000",
      ),
    );
  });

  it("says why there are no prices", () => {
    assert.match(
      run.stderr,
      /Warning: no XNT prices, since GeckoTerminal could not give them \(GeckoTerminal answered 500/,
    );
  });
});
