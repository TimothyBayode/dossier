import assert from 'node:assert/strict';
import test from 'node:test';

import { compileDossier, clampBudget, fact, DEFAULT_BUDGET, MAX_BUDGET, MIN_BUDGET } from '../src/domain/dossier.js';
import { estimateTokens } from '../src/domain/tokens.js';

test('a fact is flattened to one line so it cannot break the bullet list', () => {
  assert.equal(fact('issue', 'first line\n\nsecond line').text, 'first line second line');
  assert.equal(fact('issue', 'a\n  b\n\nc').text, 'a b c');
});

test('an unknown section is a loud failure, not a silent drop', () => {
  assert.throws(() => fact('rumours', 'something'), /unknown dossier section/);
  assert.throws(() => fact('issue', '   '), /empty dossier fact/);
});

test('the budget is clamped to the documented range', () => {
  assert.equal(clampBudget(undefined), DEFAULT_BUDGET);
  assert.equal(clampBudget('nonsense'), DEFAULT_BUDGET);
  assert.equal(clampBudget(10), MIN_BUDGET);
  assert.equal(clampBudget(999_999), MAX_BUDGET);
  assert.equal(clampBudget(1234.6), 1235);
});

test('sections render in priority order regardless of insertion order', () => {
  const result = compileDossier({
    title: 'PROJ-1 Fix the retry loop',
    budget: 4000,
    facts: [
      fact('owners', 'Ada Lovelace, 2 comments'),
      fact('decisions', '"Do not retry on 4xx.", Ada, 2026-11-20'),
      fact('issue', '**Status** In progress', { pinned: true }),
      fact('criteria', 'A 4xx response is not retried.'),
    ],
  });
  const issueAt = result.markdown.indexOf('## Issue');
  const criteriaAt = result.markdown.indexOf('## Acceptance criteria');
  const decisionsAt = result.markdown.indexOf('## Recent decisions');
  const ownersAt = result.markdown.indexOf('## People who know this');
  assert.ok(issueAt >= 0 && issueAt < criteriaAt && criteriaAt < decisionsAt && decisionsAt < ownersAt);
});

test('pinned facts survive a budget that cannot hold them, and say so', () => {
  const huge = `**Description** ${'detail '.repeat(900)}`;
  const result = compileDossier({
    title: 'PROJ-2 Oversized',
    budget: MIN_BUDGET,
    facts: [fact('issue', huge, { pinned: true }), fact('decisions', 'a decision')],
  });
  assert.equal(result.overBudget, true);
  assert.ok(result.markdown.includes('**Description**'));
  assert.match(result.markdown, /identity facts alone exceed the budget/);
});

test('the rendered document never estimates above the cap', () => {
  const facts = [];
  for (let i = 0; i < 12; i += 1) {
    facts.push(fact('decisions', `Decision ${i}: ${'x'.repeat(300)}`, { at: `2026-11-${String(10 + i).padStart(2, '0')}` }));
  }
  for (const budget of [400, 600, 1200, 3000]) {
    const result = compileDossier({ title: 'PROJ-3 Many decisions', facts, budget });
    assert.ok(
      result.used <= result.cap,
      `budget ${budget} rendered ${result.used} estimated tokens`,
    );
    assert.equal(result.used, estimateTokens(result.markdown));
  }
});

test('facts that do not fit are reported by section, not silently lost', () => {
  const facts = [];
  for (let i = 0; i < 10; i += 1) {
    facts.push(fact('decisions', `Decision ${i}: ${'y'.repeat(400)}`, { at: `2026-11-0${(i % 9) + 1}` }));
  }
  const result = compileDossier({ title: 'PROJ-4 Tight budget', facts, budget: 400 });
  const dropped = result.dropped.find((entry) => entry.key === 'decisions');
  assert.ok(dropped, 'expected the decisions section to report drops');
  assert.ok(dropped.count > 0);
  assert.match(result.markdown, /Dropped for budget: \d+ from Recent decisions/);
});

test('newer facts are kept before older ones under pressure', () => {
  const facts = [
    fact('decisions', `OLD ${'o'.repeat(900)}`, { at: '2026-01-01' }),
    fact('decisions', `NEW ${'n'.repeat(900)}`, { at: '2026-11-21' }),
    fact('decisions', `MID ${'m'.repeat(900)}`, { at: '2026-06-01' }),
  ];
  const result = compileDossier({ title: 'PROJ-5 Recency', facts, budget: 400 });
  assert.ok(result.markdown.includes('NEW'));
  assert.ok(!result.markdown.includes('OLD'));
});

test('the same facts compile to the same bytes', () => {
  const build = () =>
    compileDossier({
      title: 'PROJ-6 Deterministic',
      budget: 1200,
      generatedAt: '2026-11-22T00:00:00.000Z',
      facts: [
        fact('issue', '**Status** To do', { pinned: true }),
        fact('pulls', 'PR #41, retry guard'),
        fact('decisions', '"No retry on 4xx.", Ada', { at: '2026-11-20' }),
      ],
    });
  assert.equal(build().markdown, build().markdown);
});

test('a fact in an unrecognised section is ignored and listed', () => {
  const result = compileDossier({
    title: 'PROJ-7 Ignored',
    facts: [{ section: 'gossip', text: 'something', pinned: false }, fact('issue', '**Status** To do')],
  });
  assert.deepEqual(result.ignored, ['gossip']);
  assert.ok(!result.markdown.includes('something'));
});

test('an empty dossier still renders a usable header and footer', () => {
  const result = compileDossier({ title: 'PROJ-8 Nothing yet' });
  assert.match(result.markdown, /^# Dossier: PROJ-8 Nothing yet/);
  assert.match(result.markdown, /0 of 1500 tokens used|of 1500 tokens used/);
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.sections, []);
});
