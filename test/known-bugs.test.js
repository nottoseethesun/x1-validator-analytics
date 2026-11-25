/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), which passes while the bug is there.
 * @module test/known-bugs.test
 *
 * XNT's prices are asked through crypto-price-fetchers' GeckoTerminal
 * client of a stand-in GeckoTerminal (`helpers/stand-in-gecko-terminal.js`),
 * with a clock of the test's own.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { geckoTerminalSource, priceTimes } from "../rewards/xnt-price.js";
import { knownBug } from "./helpers/known-bug.js";
import {
  POOL,
  USDC_X,
  XNT,
  standInGeckoFetch,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";

const HOUR = 3600;
/** The first candle's open time: 04:00 UTC on 2026-10-01. */
const T0 = Date.UTC(2026, 9, 1, 4, 0, 0) / 1000;

describe("priceTimes, for a time in the hour not yet over", () => {
  knownBug(
    "gives it no price, since that hour's candle can still change",
    async () => {
      const gecko = standInGeckoTerminal({
        candles: [
          [T0, 0.25],
          [T0 + HOUR, 0.26],
        ],
      });
      const source = geckoTerminalSource({
        apiUrl: "https://gecko.stand-in.test",
        network: "x1-network",
        pool: POOL,
        xntToken: XNT,
        usdToken: USDC_X,
        fetch: standInGeckoFetch(gecko),
        sleep: async () => {},
        retryDelaysMs: [11, 22],
        now: () => (T0 + HOUR + 1800) * 1000,
        requestLog: [],
      });
      const found = await priceTimes([T0 + 1800, T0 + HOUR + 600], source);
      assert.deepEqual(found.prices, [0.25, null]);
    },
  );
});
