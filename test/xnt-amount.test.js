/**
 * Tests of rewards/xnt-amount.js: XNT amounts written exact to the lamport.
 * @module test/xnt-amount.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LAMPORTS_PER_XNT, formatXnt } from "../rewards/xnt-amount.js";

describe("formatXnt", () => {
  it("writes all nine decimal places", () => {
    assert.equal(formatXnt(1234567891n), "1.234567891");
    assert.equal(formatXnt(5n), "0.000000005");
    assert.equal(formatXnt(0n), "0.000000000");
    assert.equal(
      formatXnt(4369n * LAMPORTS_PER_XNT + 530000000n),
      "4369.530000000",
    );
  });

  it("stays exact past the largest whole number a float holds", () => {
    assert.equal(formatXnt(9007199254740993n), "9007199.254740993");
  });

  it("refuses what is not a whole number of lamports, zero or more", () => {
    assert.throws(() => formatXnt(1234567891), TypeError);
    assert.throws(() => formatXnt(-1n), TypeError);
  });
});
