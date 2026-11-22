import assert from 'node:assert/strict';
import test from 'node:test';

import { CHARS_PER_TOKEN, estimateTokens, truncateToTokens } from '../src/domain/tokens.js';

test('an empty or missing string costs nothing', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
});

test('the estimate rounds up, so a one-character fact is never free', () => {
  assert.equal(CHARS_PER_TOKEN, 4);
  assert.equal(estimateTokens('a'), 1);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
});

test('truncation keeps the stated token bound across every cap', () => {
  const text =
    'The billing worker retries every failed charge three times before it gives up, ' +
    'which is wrong for 4xx responses because they will never succeed on retry.';
  for (let cap = 1; cap <= 20; cap += 1) {
    const cut = truncateToTokens(text, cap);
    assert.ok(estimateTokens(cut) <= cap, `cap ${cap} produced ${estimateTokens(cut)} tokens`);
  }
});

test('a string that already fits comes back byte-identical', () => {
  const text = 'Short enough.';
  assert.equal(truncateToTokens(text, 10), text);
});

test('truncation trims on a word boundary and marks the cut', () => {
  const cut = truncateToTokens('alpha beta gamma delta epsilon', 3);
  assert.ok(cut.endsWith('…'));
  assert.ok(!cut.includes('  '));
  assert.ok(estimateTokens(cut) <= 3);
});

test('a zero budget yields nothing rather than a negative slice', () => {
  assert.equal(truncateToTokens('anything', 0), '');
  assert.equal(truncateToTokens('anything', -5), '');
});
