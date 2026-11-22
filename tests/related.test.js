import assert from 'node:assert/strict';
import test from 'node:test';

import { keywords, rankRelated, renderRelated } from '../src/domain/related.js';

test('keywords drop stopwords, short fragments and duplicates', () => {
  assert.deepEqual(keywords('The billing retry loop and the billing worker'), ['billing', 'retry', 'loop', 'worker']);
  assert.deepEqual(keywords('a of to'), []);
  assert.deepEqual(keywords(''), []);
});

test('a shared parent is the strongest single signal', () => {
  const [row] = rankRelated({
    subject: { id: 's', key: 'PROJ-1', title: 'Unrelated words', parent: 'PROJ-9' },
    candidates: [
      { id: 'c1', key: 'PROJ-2', title: 'Nothing alike', parent: 'PROJ-9' },
      { id: 'c2', key: 'PROJ-3', title: 'Nothing alike either', parent: 'PROJ-8' },
    ],
  });
  assert.equal(row.id, 'c1');
  assert.ok(row.why.includes('same parent'));
});

test('labels and title overlap add up and are explained', () => {
  const [row] = rankRelated({
    subject: { id: 's', key: 'PROJ-1', title: 'Fix billing retry loop', labels: ['billing'], parent: 'PROJ-9' },
    candidates: [
      { id: 'c1', key: 'PROJ-2', title: 'Billing retry backoff', labels: ['billing'], parent: 'PROJ-9' },
    ],
  });
  assert.equal(row.score, 6.5);
  assert.deepEqual(row.why, ['same parent', '1 shared label', 'shares billing, retry']);
});

test('an unconnected candidate is excluded rather than ranked last', () => {
  const rows = rankRelated({
    subject: { id: 's', key: 'PROJ-1', title: 'Billing retry', labels: ['billing'] },
    candidates: [{ id: 'c1', key: 'PROJ-2', title: 'Completely different subject', labels: ['design'] }],
  });
  assert.deepEqual(rows, []);
});

test('the subject and duplicate ids are never returned', () => {
  const rows = rankRelated({
    subject: { id: 's', key: 'PROJ-1', title: 'Billing retry', labels: ['billing'] },
    candidates: [
      { id: 's', key: 'PROJ-1', title: 'Billing retry', labels: ['billing'] },
      { id: 'c1', key: 'PROJ-2', title: 'Billing retry', labels: ['billing'] },
      { id: 'c1', key: 'PROJ-2', title: 'Billing retry', labels: ['billing'] },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'c1');
});

test('a pull request and a goal carry a small tie-break bonus', () => {
  const rows = rankRelated({
    subject: { id: 's', title: 'Billing retry', labels: ['billing'] },
    candidates: [
      { id: 'issue', key: 'PROJ-2', title: 'Billing retry', labels: ['billing'] },
      { id: 'pull', key: 'PR-9', title: 'Billing retry', labels: ['billing'], kind: 'pull' },
    ],
  });
  assert.equal(rows[0].id, 'pull');
});

test('a platform-recorded link is evidence on its own', () => {
  const rows = rankRelated({
    subject: { id: 's', title: 'Billing retry' },
    candidates: [{ id: 'c1', key: 'PROJ-2', title: 'Unrelated name', linked: true }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 2.5);
  assert.ok(rows[0].why.includes('linked in the graph'));
});

test('without a link, an unconnected candidate is still excluded', () => {
  const rows = rankRelated({
    subject: { id: 's', title: 'Billing retry' },
    candidates: [{ id: 'c1', key: 'PROJ-2', title: 'Unrelated name' }],
  });
  assert.deepEqual(rows, []);
});

test('rendering names the kind and the reason', () => {
  const text = renderRelated([
    { id: 'c1', key: 'PROJ-2', kind: 'pull', title: 'Guard 4xx', url: 'https://example.test/pr/2', why: ['same parent'] },
    { id: 'c2', key: 'PROJ-3', kind: 'goal', title: 'Cut billing failures', why: ['shares billing'] },
  ]);
  assert.match(text, /^- PR \*\*Guard 4xx\*\* \(\[PROJ-2\]\(https:\/\/example\.test\/pr\/2\)\) \(same parent\)$/m);
  assert.match(text, /^- Goal \*\*Cut billing failures\*\* \(PROJ-3\) \(shares billing\)$/m);
  assert.equal(renderRelated([]), 'Nothing else looks related.');
});
