/**
 * The known bugs, each declared with `knownBug`, which passes while its bug
 * is present. The fix of a bug makes its test fail; the same change
 * declares the test with `it` instead, among the tests of the code it is
 * about.
 * @module test/known-bugs.test
 *
 * The script runs, in a child process, against a stand-in X1 endpoint that
 * answers as the live one does for an account that began at epoch 20: no
 * reward for epochs 0 to 19, and for epoch 25, which the account missed; a
 * failed query for epoch 15, as after X1's rollback; and a reward for each
 * other epoch up to 29. It gives the account's credits for epochs 26 to 30,
 * the last five, as `getVoteAccounts` does.
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { knownBug } from "./helpers/known-bug.js";
import { startStandInX1, rewardSeconds } from "./helpers/stand-in-x1.js";
import {
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";
import { metric, runScript, VOTE_PUBKEY } from "./helpers/run-script.js";

const HOUR = 3600;

/** The stand-in chain's time: 12:00 UTC on 2026-11-10. */
const NOW_SECONDS = Date.UTC(2026, 10, 10, 12, 0, 0) / 1000;

describe("known bugs of the epochs counted", () => {
  let x1;
  let gecko;
  let run;

  before(async () => {
    x1 = await startStandInX1({
      votePubkey: VOTE_PUBKEY,
      rewardLamports: 1000000000,
      nowSeconds: NOW_SECONDS,
      currentEpoch: 30,
      noRewardThrough: 19,
      noRewardEpochs: [25],
      failEpochs: [15],
    });
    const first = Math.floor(rewardSeconds(x1.chain, 20) / HOUR) * HOUR;
    const candles = [];
    for (
      let open = first - 48 * HOUR;
      open <= first + 15 * 24 * HOUR;
      open += HOUR
    )
      candles.push([open, 0.2]);
    gecko = await serveStandInGeckoTerminal(standInGeckoTerminal({ candles }));
    run = await runScript({
      rpcUrl: x1.url,
      geckoTerminalUrl: gecko.url,
      args: ["--json"],
    });
    assert.equal(run.code, 0, run.stderr);
  });

  after(async () => {
    await Promise.all([x1?.close(), gecko?.close()]);
  });

  knownBug(
    "names, in the json export, the first epoch the account had a reward in, not the first of the last five epochs it earned credits in",
    () => {
      assert.equal(run.json.metadata.firstRewardEpoch, 20);
      assert.equal("activationEpochApprox" in run.json.metadata, false);
    },
  );

  knownBug(
    "counts an epoch answered with no reward apart from a failed query",
    () => {
      assert.equal(metric(run.analytics, "Failed Epoch Queries"), "1");
      assert.equal(
        metric(run.analytics, "Early Epoch Failures (expected from rollback)"),
        "1",
      );
      assert.equal(
        metric(run.analytics, "Unexpected Failed Epoch Queries"),
        "0",
      );
      assert.equal(metric(run.analytics, "Epochs Without a Reward"), "20");
    },
  );

  knownBug(
    "gives the share of the expected epochs with a reward from the account's first reward on, less the failed queries",
    () => {
      assert.equal(
        metric(
          run.analytics,
          "Percentage of Expected Epochs with Rewards (from the first reward on, less failed queries)",
        ),
        "90.00",
      );
    },
  );
});

describe("known bugs of a stalled endpoint", () => {
  let x1;
  let gecko;
  let run;

  before(async () => {
    x1 = await startStandInX1({
      votePubkey: VOTE_PUBKEY,
      rewardLamports: 1000000000,
      nowSeconds: NOW_SECONDS,
      stalled: true,
    });
    gecko = await serveStandInGeckoTerminal(
      standInGeckoTerminal({ candles: [] }),
    );
    run = await runScript({
      rpcUrl: x1.url,
      geckoTerminalUrl: gecko.url,
      config: { requestTimeoutSeconds: 1 },
      timeoutMs: 15000,
    });
  });

  after(async () => {
    await Promise.all([x1?.close(), gecko?.close()]);
  });

  knownBug(
    "stops waiting for an endpoint that does not answer after requestTimeoutSeconds, with exit code 1",
    () => {
      assert.equal(run.killed, false, "the run was stopped after 15 seconds");
      assert.equal(run.code, 1);
      assert.match(run.stderr, /^Error: /m);
    },
  );
});

describe("known bugs of the settings", () => {
  knownBug(
    "config.json holds only settings a program of the repo reads",
    () => {
      const config = JSON.parse(
        fs.readFileSync(new URL("../config.json", import.meta.url), "utf8"),
      );
      assert.deepEqual(Object.keys(config).sort(), [
        "apiKeys",
        "epochs",
        "liquidityPoolAddress",
        "outputFile",
        "requestTimeoutSeconds",
        "rpcUrl",
        "verbose",
      ]);
    },
  );
});
