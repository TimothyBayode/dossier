import assert from 'node:assert/strict';
import test from 'node:test';

import * as service from '../src/service/dossier.js';

const NOW = new Date('2026-11-22T00:00:00.000Z');

const ISSUE = {
  id: '10001',
  key: 'PROJ-1',
  summary: 'Fix the billing retry loop',
  descriptionText:
    'Charges retry three times on every failure.\n\n## Acceptance criteria\n- A 4xx response is never retried\n- A 5xx response retries twice\n',
  status: 'In progress',
  statusCategory: 'In Progress',
  assignee: 'Bob',
  assigneeId: 'acct-bob',
  reporter: 'Ada',
  priority: 'High',
  labels: ['billing'],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
  resolutionDate: null,
  project: 'PROJ',
  parent: null,
  links: {
    blocks: [],
    blockedBy: [{ key: 'PROJ-9', summary: 'Rate limit', status: 'To do', updated: '2026-11-10T00:00:00.000Z' }],
  },
};

const COMMENTS = [
  {
    id: '1',
    authorId: 'acct-bob',
    authorName: 'Bob',
    createdAt: '2026-11-21T00:00:00.000Z',
    body: 'We decided to stop retrying on 4xx. Everything else stays as is.',
  },
  {
    id: '2',
    authorId: 'acct-cy',
    authorName: 'Cy',
    createdAt: '2026-11-19T00:00:00.000Z',
    body: 'Looks reasonable to me, thanks.',
  },
];

const SIBLINGS = [
  {
    key: 'PROJ-2',
    summary: 'Billing backoff',
    status: 'To do',
    labels: ['billing'],
    parent: null,
    updatedAt: '2026-11-15T00:00:00.000Z',
    createdAt: '2026-11-02T00:00:00.000Z',
    resolutionDate: null,
    statusCategory: 'To Do',
  },
];

function buildDeps(overrides = {}) {
  const calls = { comments: 0, searches: [], changelogs: [], posts: [] };
  const jira = {
    getIssue: async () => ({ ...ISSUE, links: { ...ISSUE.links } }),
    getComments: async () => {
      calls.comments += 1;
      return structuredClone(COMMENTS);
    },
    search: async (jql) => {
      calls.searches.push(jql);
      return structuredClone(SIBLINGS);
    },
    getChangelog: async (key) => {
      calls.changelogs.push(key);
      return key === 'PROJ-1'
        ? [{ field: 'status', from: 'To do', to: 'In progress', at: '2026-11-20T09:00:00.000Z', author: 'Bob' }]
        : [];
    },
    addDossierComment: async (key, payload) => {
      calls.posts.push({ key, ...payload });
      return { issueKey: key, commentId: 'c-9' };
    },
  };
  const twg = {
    workItemAri: (cloudId, id) => (cloudId && id ? `ari:cloud:jira:${cloudId}:issue/${id}` : null),
    forIssue: async () => ({ pulls: [], goals: [], unavailable: 0 }),
  };
  return { deps: { jira, twg, now: () => new Date(NOW.getTime()) }, calls, ...overrides };
}

test('a dossier compiles with every section the sources can support', async () => {
  const { deps } = buildDeps();
  const result = await service.compile({ context: { cloudId: 'site-1' }, input: { issueKey: 'proj-1' }, deps });

  assert.equal(result.issueKey, 'PROJ-1');
  assert.equal(result.cap, 1500);
  assert.ok(result.used <= result.cap, `used ${result.used} over ${result.cap}`);

  const sections = result.sections.map((section) => section.key);
  for (const key of ['issue', 'criteria', 'blockers', 'decisions', 'siblings', 'owners']) {
    assert.ok(sections.includes(key), `missing section ${key}`);
  }

  assert.match(result.markdown, /# Dossier: PROJ-1 Fix the billing retry loop/);
  assert.match(result.markdown, /A 4xx response is never retried/);
  assert.match(result.markdown, /PROJ-9\*\* Rate limit, To do/);
  assert.match(result.markdown, /We decided to stop retrying on 4xx/);
  assert.match(result.markdown, /Bob: /);
  assert.match(result.markdown, /PROJ-2\*\* Billing backoff, To do/);
});

test('a comment without a decision cue is not dressed up as a decision', async () => {
  const { deps } = buildDeps();
  const result = await service.compile({ context: {}, input: { issueKey: 'PROJ-1' }, deps });
  const decisions = result.markdown.split('## Recent decisions')[1] || '';
  assert.ok(decisions.includes('We decided to stop retrying on 4xx'));
  assert.ok(!decisions.includes('Looks reasonable'));
});

test('a thin graph thins the dossier but never breaks it', async () => {
  const { deps } = buildDeps();
  deps.twg.forIssue = async () => ({ pulls: [], goals: [], unavailable: 1 });
  const result = await service.compile({ context: {}, input: { issueKey: 'PROJ-1' }, deps });
  assert.equal(result.graphUnavailable, 1);
  assert.ok(result.markdown.includes('# Dossier'));
});

test('an over-tight budget keeps the identity and reports the loss', async () => {
  const { deps } = buildDeps();
  const result = await service.compile({ context: {}, input: { issueKey: 'PROJ-1', budget: 400 }, deps });
  assert.ok(result.markdown.includes('**PROJ-1** Fix the billing retry loop'));
  assert.ok(result.used <= result.cap);
});

test('a malformed key is refused before any request is spent', async () => {
  const { deps, calls } = buildDeps();
  await assert.rejects(
    service.compile({ context: {}, input: { issueKey: 'nonsense' }, deps }),
    /issue key like PROJ-123/,
  );
  assert.equal(calls.comments, 0);
});

test('the sibling query comes from the parent, or from labels, never from nothing', async () => {
  const { deps, calls } = buildDeps();
  await service.compile({ context: {}, input: { issueKey: 'PROJ-1' }, deps });
  assert.match(calls.searches[0], /^project = PROJ AND labels in \("billing"\)$/);
});

test('find-owners ranks by evidence and says so', async () => {
  const { deps } = buildDeps();
  const result = await service.owners({ context: {}, input: { issueKey: 'PROJ-1' }, deps });
  assert.equal(result.people[0].accountId, 'acct-bob');
  assert.ok(result.people[0].evidence.comment >= 1);
  assert.match(result.markdown, /^# People who know PROJ-1/);
  assert.match(result.markdown, /assignment counts less than a comment/);
});

test('find-owners with nobody speaking falls back to the reporter', async () => {
  const { deps } = buildDeps();
  deps.jira.getComments = async () => [];
  deps.jira.getIssue = async () => ({ ...ISSUE, assignee: null, assigneeId: null });
  const result = await service.owners({ context: {}, input: { issueKey: 'PROJ-1' }, deps });
  assert.deepEqual(result.people, []);
  assert.match(result.markdown, /Nobody has touched this work/);
  assert.match(result.markdown, /Ada/);
});

test('what-changed reads the window, not the whole history', async () => {
  const { deps, calls } = buildDeps();
  deps.jira.search = async () => [
    {
      key: 'PROJ-1',
      summary: 'Retry loop',
      status: 'In progress',
      statusCategory: 'In Progress',
      createdAt: '2026-11-18T00:00:00.000Z',
      updatedAt: '2026-11-20T00:00:00.000Z',
      resolutionDate: null,
    },
    {
      key: 'PROJ-2',
      summary: 'Backoff',
      status: 'Done',
      statusCategory: 'Done',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
      resolutionDate: '2026-11-19T00:00:00.000Z',
    },
    {
      key: 'PROJ-3',
      summary: 'Stale item',
      status: 'In review',
      statusCategory: 'In Progress',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
      resolutionDate: null,
    },
  ];
  const result = await service.changes({ context: {}, input: { projectKey: 'PROJ' }, deps });

  assert.deepEqual(result.counts, { moved: 1, created: 1, resolved: 1, stale: 1 });
  assert.match(result.markdown, /PROJ-1\*\* To do → In progress, Bob \(2026-11-20\)/);
  assert.match(result.markdown, /PROJ-3\*\* Stale item: In review, untouched 33 days/);
  assert.equal(calls.changelogs.length, 3);
});

test('what-changed needs a project or a query', async () => {
  const { deps } = buildDeps();
  await assert.rejects(service.changes({ context: {}, input: {}, deps }), /project key like PROJ/);
});

test('what-changed accepts a JQL query instead of a project', async () => {
  const { deps } = buildDeps();
  const result = await service.changes({
    context: {},
    input: { jql: 'project = PROJ AND labels = "billing"' },
    deps,
  });
  assert.equal(result.counts.created, 0);
});

test('find-related names the reason a row was surfaced', async () => {
  const { deps } = buildDeps();
  deps.twg.forIssue = async () => ({
    pulls: [{ id: 'p1', title: 'Guard 4xx', state: 'OPEN', url: 'https://example.test/pr/1' }],
    goals: [{ id: 'g1', title: 'Cut billing failures' }],
    unavailable: 0,
  });
  const result = await service.related({ context: {}, input: { issueKey: 'PROJ-1' }, deps });

  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map((row) => row.id), ['goal:g1', 'pull:p1', 'issue:PROJ-2']);
  const pullRow = result.rows.find((row) => row.id === 'pull:p1');
  assert.ok(pullRow.why.includes('linked in the graph'));
  const issueRow = result.rows.find((row) => row.id === 'issue:PROJ-2');
  assert.ok(issueRow.why.includes('1 shared label'));
  assert.match(result.markdown, /# Related to PROJ-1/);
  assert.match(result.markdown, /Cut billing failures/);
});

test('publish posts the exact dossier a human can audit', async () => {
  const { deps, calls } = buildDeps();
  const result = await service.publish({ context: {}, input: { issueKey: 'PROJ-1' }, deps });

  assert.equal(result.ok, true);
  assert.equal(result.commentId, 'c-9');
  assert.match(result.markdown, /# Dossier: PROJ-1/);
  assert.equal(calls.posts.length, 1);
  assert.match(calls.posts[0].markdown, /# Dossier: PROJ-1/);
  assert.equal(calls.posts[0].cap, result.cap);
  assert.equal(calls.posts[0].generatedAt, '2026-11-22T00:00:00.000Z');
});

test('the description fact carries no criteria block and no headings', async () => {
  const { deps } = buildDeps();
  const result = await service.compile({ context: {}, input: { issueKey: 'PROJ-1' }, deps });
  const description = result.markdown
    .split('\n')
    .find((line) => line.startsWith('- **Description**'));
  assert.ok(description, 'expected a description fact');
  assert.ok(description.includes('Charges retry three times on every failure.'));
  assert.ok(!description.includes('#'), `headings leaked into the fact: ${description}`);
  const criteriaHeadings = result.markdown.match(/## Acceptance criteria/g) || [];
  assert.equal(criteriaHeadings.length, 1, 'the criteria section must appear exactly once');
});

test('site ids are read from whichever module handed them over', () => {
  assert.equal(service.cloudIdOf({ cloudId: 'abc-123-def' }), 'abc-123-def');
  assert.equal(
    service.cloudIdOf({ installContext: 'site aaaa1111-bbbb-4ccc-8ddd-eeeeffff0000 exists' }),
    'aaaa1111-bbbb-4ccc-8ddd-eeeeffff0000',
  );
  assert.equal(service.cloudIdOf({}), null);
  assert.equal(service.siteUrl({ siteUrl: 'https://x.test' }), 'https://x.test');
  assert.equal(service.siteUrl({}), null);
});
