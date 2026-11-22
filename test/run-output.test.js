/**
 * Tests of how a run of fetch-total-validator-earnings.js, the real
 * script, run in a child process against stand-ins, ends and shows its
 * progress: a run whose output's reader stops reading, an --output whose
 * folder does not exist, and the progress bar's count.
 * @module test/run-output.test
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startStandInX1 } from "./helpers/stand-in-x1.js";
import {
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";
import { runScript, VOTE_PUBKEY } from "./helpers/run-script.js";

/** The script under test. */
const SCRIPT = fileURLToPath(
  new URL("../fetch-total-validator-earnings.js", import.meta.url),
);

/** The stand-in chain's time: 12:00 UTC on 2026-11-10. */
const NOW_SECONDS = Date.UTC(2026, 10, 10, 12, 0, 0) / 1000;

/** The stand-in chain's current epoch: the run reads epochs 19 to 0. */
const CURRENT_EPOCH = 20;

describe("fetch-total-validator-earnings.js, how a run ends", () => {
  let x1;
  let gecko;

  before(async () => {
    x1 = await startStandInX1({
      votePubkey: VOTE_PUBKEY,
      rewardLamports: 1234567891,
      nowSeconds: NOW_SECONDS,
      currentEpoch: CURRENT_EPOCH,
    });
    const candles = [];
    const firstHour = Math.floor((NOW_SECONDS - 30 * 86400) / 3600) * 3600;
    for (let open = firstHour; open <= NOW_SECONDS; open += 3600)
      candles.push([open, 0.2]);
    gecko = await serveStandInGeckoTerminal(standInGeckoTerminal({ candles }));
  });

  after(async () => {
    if (x1 !== undefined) await x1.close();
    if (gecko !== undefined) await gecko.close();
  });

  it("ends with exit code 1 when the program reading its output stops reading before the files are written", async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "x1-validator-analytics-test-"),
    );
    try {
      fs.writeFileSync(
        path.join(dir, "config.json"),
        JSON.stringify({ geckoTerminalApiUrl: gecko.url }),
      );
      const code = await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [SCRIPT, "--rpc-url", x1.url, "--vote-pubkey", VOTE_PUBKEY],
          { cwd: dir, stdio: ["ignore", "pipe", "ignore"] },
        );
        // The reader takes the first line and stops, as head -1 does
        child.stdout.once("data", () => child.stdout.destroy());
        child.on("error", reject);
        child.on("exit", (exitCode) => resolve(exitCode));
      });
      assert.equal(
        fs.existsSync(path.join(dir, "xnt_rewards_with_prices.csv")),
        false,
      );
      assert.equal(code, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an --output in a folder that does not exist before it asks the chain for any reward's time", async () => {
    const asksBefore = x1.chain.blockTimeAsks;
    const run = await runScript({
      rpcUrl: x1.url,
      geckoTerminalUrl: gecko.url,
      args: ["--output", path.join(os.tmpdir(), "no-such-folder-x1", "r.csv")],
    });
    assert.equal(run.code, 1);
    assert.match(run.stderr, /--output/);
    assert.equal(x1.chain.blockTimeAsks, asksBefore);
  });

  it("counts its progress out of the epochs there are, when --epochs asks for more", async () => {
    const run = await runScript({
      rpcUrl: x1.url,
      geckoTerminalUrl: gecko.url,
      args: ["--epochs", "100"],
    });
    assert.equal(run.code, 0);
    assert.match(run.stdout, /\/20 epochs\)/);
    assert.doesNotMatch(run.stdout, /\/100 epochs\)/);
  });

  it("logs no step with --no-verbose when config.json sets verbose", async () => {
    const run = await runScript({
      rpcUrl: x1.url,
      geckoTerminalUrl: gecko.url,
      config: { verbose: true },
      args: ["--epochs", "5", "--no-verbose"],
    });
    assert.equal(run.code, 0);
    assert.doesNotMatch(run.stdout, /Querying inflation reward for epoch/);
    assert.match(run.stdout, /\(5\/5 epochs\)/);
  });
});
