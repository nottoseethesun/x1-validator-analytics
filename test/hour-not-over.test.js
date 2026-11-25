/**
 * Tests of fetch-total-validator-earnings.js, the real script, run in a
 * child process for a reward in the hour not yet over, against a stand-in
 * X1 endpoint whose present is two hours ahead of the computer's clock, so
 * that its newest reward falls in an hour not over while the script runs,
 * and a stand-in GeckoTerminal; they ask nothing outside the computer.
 * @module test/hour-not-over.test
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { rewardSeconds } from "./helpers/stand-in-x1.js";
import {
  HOUR,
  flatCandles,
  hourOf,
  metric,
  runScript,
  startStandIns,
} from "./helpers/run-script.js";

describe("fetch-total-validator-earnings.js, a reward in the hour not yet over", () => {
  let standIns;
  let run;

  before(async () => {
    /*-
     *  The chain's present two hours ahead of the computer's clock, so its
     *  newest reward falls in an hour not over while the script runs.
     */
    standIns = await startStandIns(
      { nowSeconds: Math.floor(Date.now() / 1000) + 2 * HOUR },
      (chain) => ({
        candles: flatCandles(
          hourOf(rewardSeconds(chain, 497)) - 48 * HOUR,
          hourOf(rewardSeconds(chain, 499)),
          0.2,
        ),
      }),
    );
    run = await runScript({
      rpcUrl: standIns.x1.url,
      geckoTerminalUrl: standIns.server.url,
      args: ["--epochs", "3"],
    });
  });

  after(async () => {
    if (standIns !== undefined) await standIns.close();
  });

  it("writes that reward with empty price and value cells, prices the others, and exits with code 0", () => {
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(
      run.rows.map((row) => [row["XNT Price (USD)"], row["Value (USD)"]]),
      [
        ["0.200000", "0.2469"],
        ["0.200000", "0.2469"],
        ["", ""],
      ],
    );
    assert.equal(metric(run.analytics, "Rewards Without an XNT Price"), "1");
  });

  it("warns of it apart, saying a run once the hour is over prices it, and not as a reward with no candle", () => {
    assert.match(
      run.stderr,
      /Warning: 1 of 3 rewards fall in the hour not yet over, whose candle can still change, so they have no XNT price: their price and value cells are empty, and the USD totals leave them out\. A run once the hour is over prices them\./,
    );
    assert.doesNotMatch(
      run.stderr,
      /have no XNT price, since GeckoTerminal gave no/,
    );
  });
});
