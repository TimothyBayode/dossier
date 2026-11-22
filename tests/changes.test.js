import assert from 'node:assert/strict';
import test from 'node:test';

import { summariseChanges } from '../src/domain/changes.js';

const events = [
  { kind: 'status', key: 'PROJ-1', from: 'To do', to: 'In progress', at: '2026-11-20T09:00:00.000Z', author: 'Ada' },
  { kind: 'status', key: 'PROJ-2', from: 'In progress', to: 'Done', at: '2026-11-18T09:00:00.000Z', author: 'Bob' },
  { kind: 'created', key: 'PROJ-3', summary: 'Retry budget', at: '2026-11-19T09:00:00.000Z' },
  { kind: 'resolved', key: 'PROJ-2', summary: 'Guard 4xx', at: '2026-11-18T09:00:00.000Z' },
  { kind: 'status', key: 'PROJ-4', from: 'To do', to: 'In progress', at: '2026-10-01T09:00:00.000Z', author: 'Cy' },
];

test('the window drops anything at or before the cutoff', () => {
  const result = summariseChanges({ events, since: '2026-11-15T00:00:00.000Z' });
  assert.deepEqual(result.moves.map((row) => row.key), ['PROJ-1', 'PROJ-2']);
  assert.deepEqual(result.created.map((row) => row.key), ['PROJ-3']);
  assert.deepEqual(result.resolved.map((row) => row.key), ['PROJ-2']);
  assert.deepEqual(result.counts, { moved: 2, created: 1, resolved: 1, stale: 0 });
});

test('without a window every event counts, newest first', () => {
  const result = summariseChanges({ events });
  assert.deepEqual(result.moves.map((row) => row.key), ['PROJ-1', 'PROJ-2', 'PROJ-4']);
});

test('stale rows are ordered by how long they have been untouched', () => {
  const result = summariseChanges({
    events: [],
    stale: [
      { key: 'PROJ-7', summary: 'Nine days', status: 'In progress', days: 9 },
      { key: 'PROJ-8', summary: 'Thirty days', status: 'In review', days: 30 },
    ],
  });
  assert.deepEqual(result.stale.map((row) => row.key), ['PROJ-8', 'PROJ-7']);
  assert.match(result.markdown, /untouched 30 days/);
});

test('an empty window says so rather than rendering empty headings', () => {
  const result = summariseChanges({ events, since: '2026-12-01T00:00:00.000Z' });
  assert.equal(result.markdown.includes('## Status moves'), false);
  assert.match(result.markdown, /Nothing moved\./);
});

test('the markdown names the window and reads like a handover', () => {
  const result = summariseChanges({ events, since: '2026-11-15T00:00:00.000Z' });
  assert.match(result.markdown, /^# Changes since 2026-11-15/);
  assert.match(result.markdown, /PROJ-1\*\* To do → In progress, Ada \(2026-11-20\)/);
});

test('a limit caps each group independently', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({
    kind: 'status',
    key: `PROJ-${i}`,
    from: 'To do',
    to: 'Done',
    at: `2026-11-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const result = summariseChanges({ events: many, limit: 3 });
  assert.equal(result.moves.length, 3);
  assert.equal(result.counts.moved, 3);
});
