/**
 * @fileoverview
 * XNT amounts, exact to the lamport.
 *
 * XNT has nine decimal places: one XNT is 1,000,000,000 lamports. An amount
 * is kept as a whole number of lamports, a BigInt, and written with all nine
 * places, never through a float, so no amount or total loses a digit.
 */

/** Lamports in one XNT. */
export const LAMPORTS_PER_XNT = 1_000_000_000n;

/**
 * Writes an amount of lamports as XNT, with all nine decimal places.
 *
 * @param {bigint} lamports - The amount, in lamports, zero or more
 * @returns {string} The amount in XNT, such as '1.234567891'
 * @throws {TypeError} When the amount is not a BigInt of zero or more
 */
export function formatXnt(lamports) {
  if (typeof lamports !== 'bigint' || lamports < 0n) {
    throw new TypeError(`Not an amount of lamports: ${String(lamports)}`);
  }
  const fraction = String(lamports % LAMPORTS_PER_XNT).padStart(9, '0');
  return `${lamports / LAMPORTS_PER_XNT}.${fraction}`;
}
