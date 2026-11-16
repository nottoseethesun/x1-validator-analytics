/**
 * @fileoverview
 * The rows of the rewards report, one per reward: its amount in XNT, exact
 * to the lamport, its USD price and value where it has a price, and the
 * running totals of both.
 *
 * A price is written to six decimal places, and a value is the amount times
 * that written price, to four, so each row multiplies out as shown. The
 * running USD total adds the values as written, so it adds up as shown too,
 * and it leaves out each reward that has no price.
 */

import moment from 'moment';
import { formatXnt } from './xnt-amount.js';

/** Units of a written USD value in one dollar: values have four decimal places. */
const VALUE_UNITS_PER_USD = 10000;

/**
 * Works out a reward's USD value, in units of a ten-thousandth of a dollar.
 *
 * @param {string} xntAmount - The amount, as `formatXnt` writes it
 * @param {string} priceUSD - The price per XNT, as written
 * @returns {number} The value, in ten-thousandths of a dollar
 */
function valueUnits(xntAmount, priceUSD) {
  return Math.round(Number(xntAmount) * Number(priceUSD) * VALUE_UNITS_PER_USD);
}

/**
 * Writes a number of ten-thousandths of a dollar as dollars.
 *
 * @param {number} units - The number of ten-thousandths
 * @returns {string} The dollars, to four decimal places
 */
function formatValue(units) {
  return (units / VALUE_UNITS_PER_USD).toFixed(4);
}

/**
 * Builds the report's rows from the rewards and their prices.
 *
 * @param {Array<{epoch: number, timestamp: number, lamports: bigint}>} rewards - The rewards, oldest first,
 *   each with its block time in unix seconds and its amount in lamports
 * @param {Array<number|null>} prices - Each reward's price in USD per XNT, or null where it has none
 * @returns {Array<Object>} One row per reward: epoch, rewardDate, lamports, xntAmount, priceUSD and
 *   valueUSD (null where there is no price), cumulativeXNT and cumulativeUSD
 */
export function rewardRows(rewards, prices) {
  let cumulativeLamports = 0n;
  let cumulativeUnits = 0;
  return rewards.map((reward, index) => {
    const xntAmount = formatXnt(reward.lamports);
    const price = prices[index];
    const priceUSD = price === null ? null : price.toFixed(6);
    const units = priceUSD === null ? null : valueUnits(xntAmount, priceUSD);
    cumulativeLamports += reward.lamports;
    cumulativeUnits += units ?? 0;
    return {
      epoch: reward.epoch,
      rewardDate: moment.unix(reward.timestamp).utc().format('YYYY-MM-DD HH:mm:ss'),
      lamports: reward.lamports,
      xntAmount,
      priceUSD,
      valueUSD: units === null ? null : formatValue(units),
      cumulativeXNT: formatXnt(cumulativeLamports),
      cumulativeUSD: formatValue(cumulativeUnits)
    };
  });
}
