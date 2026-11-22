import assert from 'node:assert/strict';
import test from 'node:test';

import { acceptanceCriteria, decisionQuote, splitSentences, withoutCriteria } from '../src/domain/extract.js';

const DESCRIPTION = `Charges retry three times on every failure.

## Acceptance criteria
- A 4xx response is never retried
1. A 5xx response retries twice
- The budget is never exceeded

## Notes
Nothing else.

## Acceptance criteria
- A second list is ignored
`;

test('criteria are read from the heading and stop at the next one', () => {
  assert.deepEqual(acceptanceCriteria(DESCRIPTION), [
    'A 4xx response is never retried',
    'A 5xx response retries twice',
    'The budget is never exceeded',
  ]);
});

test('a description without a heading yields nothing rather than a guess', () => {
  assert.deepEqual(acceptanceCriteria('A 4xx response is never retried'), []);
  assert.deepEqual(acceptanceCriteria(''), []);
  assert.deepEqual(acceptanceCriteria(null), []);
});

test('the heading may be numbered or unstyled', () => {
  const text = 'acceptance criteria:\n- first\n- second';
  assert.deepEqual(acceptanceCriteria(text), ['first', 'second']);
});

test('a paragraph after the list ends it', () => {
  const text = 'Acceptance criteria\n- one\n\nSome trailing note.';
  assert.deepEqual(acceptanceCriteria(text), ['one']);
});

test('withoutCriteria removes every criteria block, and only them', () => {
  assert.equal(
    withoutCriteria(DESCRIPTION),
    'Charges retry three times on every failure.\n\n\n## Notes\nNothing else.',
    'the prose and other headings stay, both criteria blocks go',
  );
  assert.equal(withoutCriteria('Plain prose only.'), 'Plain prose only.');
  assert.equal(withoutCriteria(''), '');
  assert.equal(withoutCriteria(null), '');
});

test('a fact is one line, whatever the caller passed in', async () => {
  const { fact } = await import('../src/domain/dossier.js');
  const built = fact('issue', '**Status** In progress\n\n> a quote\n- a bullet');
  assert.ok(!built.text.includes('\n'));
  assert.equal(built.text, '**Status** In progress > a quote - a bullet');
});

test('sentences split on punctuation and collapse whitespace', () => {
  assert.deepEqual(splitSentences('One. Two.  Three!'), ['One.', 'Two.', 'Three!']);
  assert.deepEqual(splitSentences(''), []);
});

test('a decision is quoted verbatim, the first cue sentence only', () => {
  const body = 'Looks reasonable. We decided to stop retrying on 4xx. We will also add a budget.';
  assert.equal(decisionQuote(body), 'We decided to stop retrying on 4xx.');
});

test('a comment with no decision cue returns null', () => {
  assert.equal(decisionQuote('Looks reasonable to me, thanks.'), null);
  assert.equal(decisionQuote(''), null);
  assert.equal(decisionQuote(null), null);
});

test('a long decision is cut on a character bound, still readable', () => {
  const sentence = `We agreed to ${'x'.repeat(400)}.`;
  const quote = decisionQuote(sentence, { max: 240 });
  assert.ok(quote.length <= 240);
  assert.ok(quote.endsWith('…'));
  assert.ok(quote.startsWith('We agreed to'));
});
