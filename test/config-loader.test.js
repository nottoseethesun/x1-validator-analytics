/**
 * Tests of the script's settings (`configLoader.js`) and of the public
 * keys its options and settings hold (`public-key.js`).
 * @module test/config-loader.test
 *
 * The settings files are written in a temp folder of the test's own,
 * removed afterwards; the repo's own `config.json` is read, never written.
 */

import { after, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS, loadConfig } from "../configLoader.js";
import { isPublicKey } from "../public-key.js";

/** The repo's own config.json. */
const REPO_CONFIG = fileURLToPath(new URL("../config.json", import.meta.url));

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "x1-config-loader-"));
after(() => fs.rmSync(folder, { recursive: true, force: true }));

/**
 * Writes a settings file in the test's temp folder.
 *
 * @param {string} name - The file's name
 * @param {Object} settings - Its settings
 * @returns {string} Its path
 */
function settingsFile(name, settings) {
  const file = path.join(folder, name);
  fs.writeFileSync(file, JSON.stringify(settings));
  return file;
}

describe("loadConfig", () => {
  it("takes the repo's config.json, which holds to the schema", () => {
    const committed = JSON.parse(fs.readFileSync(REPO_CONFIG, "utf8"));
    assert.deepEqual(loadConfig(REPO_CONFIG), { ...DEFAULTS, ...committed });
  });

  it("lays each setting of config.json over the same default", () => {
    const file = settingsFile("over.json", { epochs: 20, verbose: true });
    assert.deepEqual(loadConfig(file), {
      ...DEFAULTS,
      epochs: 20,
      verbose: true,
    });
  });

  it("gives the defaults, with a notice, when there is no config.json", () => {
    const warn = mock.method(console, "warn", () => {});
    try {
      assert.deepEqual(loadConfig(path.join(folder, "none.json")), DEFAULTS);
      assert.match(
        warn.mock.calls[0].arguments[0],
        /none\.json in this folder: the run takes the defaults/,
      );
    } finally {
      warn.mock.restore();
    }
  });

  it("refuses a key no setting has and a public key, a url or a time limit of the wrong kind, listing every problem", () => {
    const file = settingsFile("wrong.json", {
      outputfile: "x.csv",
      xntTokenAddress: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39",
      geckoTerminalApiUrl: "api.geckoterminal.com",
      requestTimeoutSeconds: "30",
      apiKeys: ["moralis", "moralis"],
    });
    assert.throws(() => loadConfig(file), {
      message: [
        "config.json → outputfile is not a setting this tool reads",
        'config.json → requestTimeoutSeconds must be a whole number of seconds from 1 to 2147483, the longest Node\'s timers keep; it is "30"',
        'config.json → geckoTerminalApiUrl must be an http or https url; it is "api.geckoterminal.com"',
        'config.json → xntTokenAddress must be a public key, 32 bytes written in base58; it is "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39"',
        'config.json → apiKeys must be a list of the services whose keys the programs send, each once; it is ["moralis","moralis"]',
      ].join("\n"),
    });
  });
});

describe("loadConfig's time limit", () => {
  it("refuses a time limit Node's timers cannot keep: a fraction of a second, which Node refuses as a timer's delay, or more than 2147483 seconds, which ends every request at once", () => {
    for (const requestTimeoutSeconds of [2.01, 3000000]) {
      const file = settingsFile(`${requestTimeoutSeconds}.json`, {
        requestTimeoutSeconds,
      });
      assert.throws(() => loadConfig(file), {
        message:
          /requestTimeoutSeconds must be a whole number of seconds from 1 to 2147483/,
      });
    }
  });
});

describe("isPublicKey", () => {
  it("takes 32 bytes written in base58, and refuses other text", () => {
    assert.equal(isPublicKey(DEFAULTS.liquidityPoolAddress), true);
    assert.equal(isPublicKey(DEFAULTS.xntTokenAddress), true);
    assert.equal(isPublicKey("1".repeat(43)), false);
    assert.equal(isPublicKey("0OIl" + "1".repeat(40)), false);
    assert.equal(isPublicKey("abc"), false);
  });
});

describe("config.json", () => {
  it("holds only settings a program of the repo reads", () => {
    const config = JSON.parse(fs.readFileSync(REPO_CONFIG, "utf8"));
    assert.deepEqual(Object.keys(config).sort(), [
      "apiKeys",
      "epochs",
      "liquidityPoolAddress",
      "outputFile",
      "requestTimeoutSeconds",
      "rpcUrl",
      "verbose",
    ]);
  });
});
