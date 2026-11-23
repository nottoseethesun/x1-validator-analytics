/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`test/helpers/known-bug.js`), which passes while the bug is
 * there. A fix makes the test fail: the same change declares it with `it`
 * among the tests of the code it is about, and removes this file once no
 * test is left in it.
 * @module test/known-bugs.test
 */

import { describe } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";

/** Whether git ignores a path, from the repo's top folder. */
const ignored = (place) =>
  spawnSync("git", ["check-ignore", "-q", "--no-index", place], {
    cwd: new URL("..", import.meta.url),
  }).status === 0;

describe("the owner's files in output/", () => {
  knownBug(
    "git ignores a file written directly in output/, as it does one in output/csv/",
    () => {
      assert.equal(ignored("output/csv/x.csv"), true);
      assert.equal(ignored("output/rewards.csv"), true);
      assert.equal(ignored("output/csv/.gitkeep"), false);
    },
  );
});
