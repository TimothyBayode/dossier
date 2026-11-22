import assert from 'node:assert/strict';
import test from 'node:test';

import { describeOwner, rankOwners } from '../src/domain/owners.js';

const NOW = new Date('2026-11-22T00:00:00.000Z');

test('a recent comment outranks a stale assignment', () => {
  const ranked = rankOwners({
    now: NOW,
    signals: [
      { accountId: 'ada', displayName: 'Ada', kind: 'comment', at: '2026-11-22T00:00:00.000Z' },
      { accountId: 'bob', displayName: 'Bob', kind: 'assignment', at: '2026-09-23T00:00:00.000Z' },
    ],
  });
  assert.equal(ranked[0].accountId, 'ada');
  assert.equal(ranked[0].score, 2);
  assert.equal(ranked[1].accountId, 'bob');
  assert.equal(ranked[1].score, 0.75);
});

test('authored code beats a comment from the same moment', () => {
  const ranked = rankOwners({
    now: NOW,
    signals: [
      { accountId: 'ada', kind: 'comment', at: '2026-11-21T00:00:00.000Z' },
      { accountId: 'bob', kind: 'authored', at: '2026-11-21T00:00:00.000Z' },
    ],
  });
  assert.equal(ranked[0].accountId, 'bob');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('an undated signal counts, but at a quarter weight', () => {
  const ranked = rankOwners({
    now: NOW,
    signals: [{ accountId: 'ada', displayName: 'Ada', kind: 'assignment' }],
  });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].score, 0.75);
  assert.equal(ranked[0].lastAt, null);
});

test('a half-life really halves the weight', () => {
  const at = '2026-10-23T00:00:00.000Z'; // exactly 30 days before NOW
  const ranked = rankOwners({ now: NOW, signals: [{ accountId: 'ada', kind: 'comment', at }] });
  assert.equal(ranked[0].score, 1);
});

test('evidence is counted per kind and people are capped', () => {
  const signals = [];
  for (let i = 0; i < 4; i += 1) {
    signals.push({ accountId: 'ada', displayName: 'Ada', kind: 'comment', at: '2026-11-20T00:00:00.000Z' });
  }
  signals.push({ accountId: 'ada', kind: 'assignment', at: '2026-11-19T00:00:00.000Z' });
  for (const id of ['bob', 'cy', 'dee', 'eve', 'fay', 'gus']) {
    signals.push({ accountId: id, displayName: id.toUpperCase(), kind: 'comment', at: '2026-01-01T00:00:00.000Z' });
  }
  const ranked = rankOwners({ now: NOW, signals, limit: 3 });
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].accountId, 'ada');
  assert.deepEqual(ranked[0].evidence, { authored: 0, assignment: 1, comment: 4 });
});

test('signals without an account, or of an unknown kind, are ignored', () => {
  const ranked = rankOwners({
    now: NOW,
    signals: [
      { kind: 'comment', at: '2026-11-22T00:00:00.000Z' },
      { accountId: 'ada', kind: 'gossip', at: '2026-11-22T00:00:00.000Z' },
      null,
    ],
  });
  assert.deepEqual(ranked, []);
});

test('the description reads as a sentence a human can act on', () => {
  const [person] = rankOwners({
    now: NOW,
    signals: [
      { accountId: 'ada', displayName: 'Ada Lovelace', kind: 'comment', at: '2026-11-20T00:00:00.000Z' },
      { accountId: 'ada', displayName: 'Ada Lovelace', kind: 'authored', at: '2026-11-18T00:00:00.000Z' },
      { accountId: 'ada', displayName: 'Ada Lovelace', kind: 'assignment', at: '2026-11-10T00:00:00.000Z' },
    ],
  });
  assert.equal(describeOwner(person), 'Ada Lovelace: 1 linked change, 1 comment, 1 assignment, last 2026-11-20');
});
