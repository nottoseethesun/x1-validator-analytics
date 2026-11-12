/**
 * Declares a test of a known bug, for mocha.
 *
 * A known-bug test states what the code should do, in a check made of chai
 * assertions, and passes while the code still does the wrong thing, which
 * is while the check fails on one of its assertions. Once the code does the
 * right thing, the check passes and the test fails, saying so. That is the
 * cue to declare the test with `it` instead, in the same change as the fix,
 * so it then guards the fix. A check that fails with any other error fails
 * the test too, since the check then no longer tests the bug.
 */

/**
 * Declares a known-bug test.
 *
 * @param {string} name - What the code should do
 * @param {function(): (void|Promise<void>)} check - Asserts that it does
 */
function knownBug(name, check) {
  it(`known bug: ${name}`, async function () {
    try {
      await check();
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.name === 'AssertionError') return;
      throw error;
    }
    throw new Error('This known bug looks fixed: declare its test with it() instead of knownBug().');
  });
}

module.exports = { knownBug };
