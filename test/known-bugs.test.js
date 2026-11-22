/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here. The
 * settings files are written in a temp folder of the test's own, removed
 * afterwards.
 */

import { after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { knownBug } from "./helpers/known-bug.js";
import { loadConfig } from "../configLoader.js";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "x1-known-bugs-"));
after(() => fs.rmSync(folder, { recursive: true, force: true }));

describe("loadConfig", () => {
  knownBug(
    "refuses a time limit Node's timers cannot keep: a fraction of a second, which Node refuses as a timer's delay, or more than 2147483 seconds, which ends every request at once",
    () => {
      for (const requestTimeoutSeconds of [2.01, 3000000]) {
        const file = path.join(folder, `${requestTimeoutSeconds}.json`);
        fs.writeFileSync(file, JSON.stringify({ requestTimeoutSeconds }));
        assert.throws(() => loadConfig(file), {
          message:
            /requestTimeoutSeconds must be a whole number of seconds from 1 to 2147483/,
        });
      }
    },
  );
});
