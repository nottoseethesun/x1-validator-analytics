/**
 * @fileoverview
 * A public key, as X1 writes an account's or a token's address: 32 bytes,
 * written in base58, the alphabet of Bitcoin's addresses without 0, O, I
 * and l.
 *
 * The command line's options and `config.json`'s settings that hold one
 * meet one rule: `PUBLIC_KEY` is its kind of value, a JSON Schema whose
 * `description` is the words a refusal uses, checked by the format
 * `public-key`, which `PUBLIC_KEY_FORMATS` gives crypto-price-fetchers'
 * schema checks (`crypto-price-fetchers/lib/settings-schema`). web3.js,
 * Solana's JavaScript library, which X1 uses as a Solana fork, decodes the
 * key, so text that is base58 but not 32 bytes is refused too.
 */

import { PublicKey } from "@solana/web3.js";

/**
 * Says whether text is a public key: 32 to 44 base58 characters that
 * web3.js decodes into 32 bytes.
 *
 * @param {string} text - The text
 * @returns {boolean} Whether it is one
 */
export function isPublicKey(text) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  try {
    new PublicKey(text);
    return true;
  } catch {
    return false;
  }
}

/** The format that checks a public key, for the schema checks. */
export const PUBLIC_KEY_FORMATS = Object.freeze({ "public-key": isPublicKey });

/** The kind of value of a public key, with the words a refusal uses. */
export const PUBLIC_KEY = Object.freeze({
  type: "string",
  format: "public-key",
  description: "a public key, 32 bytes written in base58",
});
