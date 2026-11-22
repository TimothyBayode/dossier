/**
 * The service layer: one function per tool, and every one of them returns a
 * string an agent can read or an object the UI can render.
 *
 * The interesting property is in `compile`: the facts are gathered from up to
 * four sources, the compiler decides what fits, and the caller is told what was
 * left out. An agent that knows a dossier is partial asks for more or stops;
 * an agent handed a "complete" dump guesses.
 *
 * Every function takes `deps` so tests can supply stub adapters and a frozen
 * clock. Forge is not involved in these tests at all.
 */

import {
  compileDossier,
  clampBudget,
  fact,
  DEFAULT_BUDGET,
} from '../domain/dossier.js';
import { describeOwner, rankOwners } from '../domain/owners.js';
import { summariseChanges } from '../domain/changes.js';
import { keywords, rankRelated, renderRelated } from '../domain/related.js';
import { acceptanceCriteria, decisionQuote, withoutCriteria } from '../domain/extract.js';
import { truncateToTokens } from '../domain/tokens.js';
import * as jiraAdapter from '../platform/jira.js';
import * as twgAdapter from '../platform/twg.js';

const DEPS = { jira: jiraAdapter, twg: twgAdapter, now: () => new Date() };

const ISSUE_KEY = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const PROJECT_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;
const DAY_MS = 86_400_000;

/** Fail loudly on a malformed key: an agent guessing a key is worse than 400. */
export function requireKey(value) {
  const key = String(value ?? '').trim().toUpperCase();
  if (!ISSUE_KEY.test(key)) throw new Error('Give me an issue key like PROJ-123.');
  return key;
}

export function requireProject(value) {
  const key = String(value ?? '').trim().toUpperCase();
  if (!PROJECT_KEY.test(key)) throw new Error('Give me a project key like PROJ.');
  return key;
}

/** Forge hands the site id to different modules in different places. */
export function cloudIdOf(context = {}) {
  if (context.cloudId) return String(context.cloudId);
  const raw = String(context.installContext || '');
  const match = raw.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : null;
}

export function siteUrl(context = {}) {
  return context.siteUrl || context.extension?.siteUrl || null;
}

/** Everything the ranking knows: who holds the ticket, and who has spoken. */
export function ownerSignals(issue, comments = []) {
  const signals = [];
  if (issue.assigneeId) {
    signals.push({
      accountId: issue.assigneeId,
      displayName: issue.assignee,
      kind: 'assignment',
      at: issue.updatedAt,
    });
  }
  for (const comment of comments) {
    if (!comment.authorId) continue;
    signals.push({
      accountId: comment.authorId,
      displayName: comment.authorName,
      kind: 'comment',
      at: comment.createdAt,
    });
  }
  return signals;
}

export function daysBetween(now, isoDate) {
  const at = new Date(isoDate).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.round((nowMs - at) / DAY_MS));
}

function daysOfStaleness(now, issue) {
  // The normalised issue field is `updatedAt`; `updated` is Jira's raw name and
  // never survives normalisation.
  if (!issue.updatedAt) return 0;
  return daysBetween(now, issue.updatedAt);
}

async function siblingsOf(issue, deps) {
  if (issue.parent?.key) {
    const rows = await deps.jira.search(`parent = "${issue.parent.key}"`, { limit: 25 });
    return rows.filter((row) => row.key !== issue.key);
  }
  if (issue.labels.length) {
    const labels = issue.labels
      .slice(0, 5)
      .map((label) => `"${String(label).replace(/"/g, '')}"`)
      .join(', ');
    const rows = await deps.jira.search(
      `project = ${issue.project} AND labels in (${labels})`,
      { limit: 25 },
    );
    return rows.filter((row) => row.key !== issue.key);
  }
  const rows = await deps.jira.search(`project = ${issue.project}`, { limit: 25 });
  return rows.filter((row) => row.key !== issue.key && row.parent?.key === issue.parent?.key);
}

/**
 * compile, the product. Returns `{ markdown, ... }`.
 */
export async function compile({ context = {}, input = {}, deps = DEPS } = {}) {
  const key = requireKey(input.issueKey);
  const budget = clampBudget(input.budget ?? DEFAULT_BUDGET);
  const issue = await deps.jira.getIssue(key);
  const cloudId = cloudIdOf(context);

  const [comments, graph] = await Promise.all([
    deps.jira
      .getComments(key, { limit: 40 })
      .catch((error) => {
        console.error(`[dossier] comments failed for ${key}: ${error.message}`);
        return [];
      }),
    deps.twg
      .forIssue(deps.twg.workItemAri(cloudId, issue.id))
      .catch((error) => {
        console.error(`[dossier] graph failed for ${key}: ${error.message}`);
        return { pulls: [], goals: [], unavailable: 1 };
      }),
  ]);

  const newest = [...comments].sort((a, b) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  );

  const facts = [];

  // Identity is pinned: without it nothing else in the dossier is anchored.
  facts.push(fact('issue', `**${issue.key}** ${issue.summary}`, { pinned: true }));
  facts.push(
    fact(
      'issue',
      `**Status** ${issue.status || 'Unknown'} · **Assignee** ${issue.assignee || 'Unassigned'} · **Priority** ${
        issue.priority || 'None'
      }${issue.labels.length ? ` · **Labels** ${issue.labels.join(', ')}` : ''}`,
      { pinned: true },
    ),
  );
  if (issue.descriptionText) {
    // Headings and bullet markers are stripped: a "#" inside a bullet reads as
    // a broken document, and the criteria section already carries the criteria.
    const condensed = withoutCriteria(issue.descriptionText)
      .split('\n')
      .map((line) =>
        line
          .trim()
          .replace(/^#{1,6}\s*/, '')
          .replace(/^[-*•]\s+/, '')
          .replace(/^\d+[.)]\s+/, ''),
      )
      .filter(Boolean)
      .join(' · ');
    if (condensed) {
      facts.push(fact('issue', `**Description** ${truncateToTokens(condensed, 180)}`));
    }
  }

  for (const line of acceptanceCriteria(issue.descriptionText)) {
    facts.push(fact('criteria', line));
  }

  for (const blocker of issue.links.blockedBy) {
    facts.push(fact('blockers', `**${blocker.key}** ${blocker.summary}, ${blocker.status}`, { at: blocker.updated }));
  }

  // Only comments that read like a decision, quoted verbatim with who said it.
  for (const comment of newest) {
    if (facts.filter((item) => item.section === 'decisions').length >= 5) break;
    const quote = decisionQuote(comment.body);
    if (!quote) continue;
    facts.push(
      fact(
        'decisions',
        `"${truncateToTokens(quote, 48)}" (${comment.authorName}, ${String(comment.createdAt).slice(0, 10)})`,
        { at: comment.createdAt },
      ),
    );
  }

  for (const pull of graph.pulls) {
    facts.push(fact('pulls', `${pull.title}, ${pull.state}${pull.url ? ` (${pull.url})` : ''}`));
  }

  if (issue.parent) {
    facts.push(fact('goals', `Parent **${issue.parent.key}** ${issue.parent.summary}`));
  }
  for (const goal of graph.goals) {
    facts.push(fact('goals', goal.title));
  }

  const siblings = await siblingsOf(issue, deps).catch((error) => {
    console.error(`[dossier] siblings failed for ${key}: ${error.message}`);
    return [];
  });
  for (const sibling of siblings.slice(0, 6)) {
    facts.push(fact('siblings', `**${sibling.key}** ${sibling.summary}, ${sibling.status}`));
  }

  const ranked = rankOwners({
    signals: ownerSignals(issue, newest),
    now: deps.now(),
    limit: 4,
  });
  for (const person of ranked) {
    facts.push(fact('owners', describeOwner(person), { at: person.lastAt }));
  }

  const compiled = compileDossier({
    title: `${issue.key} ${issue.summary}`,
    facts,
    budget,
    generatedAt: deps.now().toISOString(),
  });

  return {
    ...compiled,
    issueKey: issue.key,
    commentsRead: comments.length,
    graphUnavailable: graph.unavailable,
  };
}

/** find-owners, who to ask, ranked by who has touched the work recently. */
export async function owners({ context = {}, input = {}, deps = DEPS } = {}) {
  const key = requireKey(input.issueKey);
  const issue = await deps.jira.getIssue(key);
  const comments = await deps.jira.getComments(key, { limit: 100 }).catch(() => []);
  const ranked = rankOwners({
    signals: ownerSignals(issue, comments),
    now: deps.now(),
    limit: Math.max(1, Math.min(10, Number(input.limit) || 5)),
  });

  const intro = ranked.length
    ? '> Ranked by how recently each person touched this work. An assignment counts less than a comment, which counts less than a linked change.'
    : '> Nobody has touched this work. The reporter is the only trail: ' + (issue.reporter || 'no reporter recorded') + '.';

  const lines = ranked.map((person) => `- ${describeOwner(person)}`);
  const markdown = [`# People who know ${key}`, intro, lines.join('\n')].filter(Boolean).join('\n\n');
  return { markdown, people: ranked, commentsRead: comments.length };
}

/** what-changed, the window an agent returning to a project needs. */
export async function changes({ context = {}, input = {}, deps = DEPS } = {}) {
  const now = deps.now();
  const staleDays = Math.max(1, Math.min(90, Number(input.staleDays) || 14));
  const since = input.since ? String(input.since) : new Date(now.getTime() - staleDays * DAY_MS).toISOString();

  const jql = String(input.jql || '').trim();
  if (!jql) requireProject(input.projectKey); // fail before a request is spent
  const scope =
    jql ||
    `project = ${requireProject(input.projectKey)} AND updated >= "${since.slice(0, 10)}"`;
  const issues = await deps.jira.search(scope, { limit: 60 });

  const events = [];
  for (const issue of issues) {
    if (issue.createdAt && issue.createdAt > since) {
      events.push({ kind: 'created', key: issue.key, summary: issue.summary, at: issue.createdAt });
    }
    if (issue.resolutionDate && issue.resolutionDate > since) {
      events.push({ kind: 'resolved', key: issue.key, summary: issue.summary, at: issue.resolutionDate });
    }
  }

  // Changelogs are one request per issue. Ten, in parallel, is the honest bound:
  // past that the function risks its own timeout for a marginal row.
  const recent = issues.slice(0, 10);
  const histories = await Promise.all(
    recent.map((issue) => deps.jira.getChangelog(issue.key).catch(() => [])),
  );
  recent.forEach((issue, index) => {
    for (const move of histories[index] || []) {
      if (move.at && move.at > since) {
        events.push({
          kind: 'status',
          key: issue.key,
          from: move.from,
          to: move.to,
          at: move.at,
          author: move.author,
        });
      }
    }
  });

  const stale = issues
    .filter((issue) => !/done/i.test(issue.statusCategory) && daysOfStaleness(now, issue) >= staleDays)
    .map((issue) => ({
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      days: daysOfStaleness(now, issue),
    }));

  const summary = summariseChanges({ events, stale, since, limit: 40 });
  return { ...summary, issuesScanned: issues.length };
}

/** find-related, the graph answer plus the similarity answer, with reasons. */
export async function related({ context = {}, input = {}, deps = DEPS } = {}) {
  const key = requireKey(input.issueKey);
  const issue = await deps.jira.getIssue(key);
  const cloudId = cloudIdOf(context);
  const graph = await deps.twg
    .forIssue(deps.twg.workItemAri(cloudId, issue.id))
    .catch(() => ({ pulls: [], goals: [], unavailable: 1 }));

  const candidates = [];
  for (const pull of graph.pulls) {
    candidates.push({ id: `pull:${pull.id}`, kind: 'pull', key: pull.id, title: pull.title, url: pull.url, state: pull.state, linked: true });
  }
  for (const goal of graph.goals) {
    candidates.push({ id: `goal:${goal.id}`, kind: 'goal', key: null, title: goal.title, linked: true });
  }

  const pool = await siblingsOf(issue, deps).catch((error) => {
    console.error(`[dossier] sibling pool failed for ${key}: ${error.message}`);
    return [];
  });
  const base = siteUrl(context);
  for (const row of pool) {
    candidates.push({
      id: `issue:${row.key}`,
      kind: 'issue',
      key: row.key,
      title: row.summary,
      labels: row.labels,
      parent: row.parent?.key ?? null,
      status: row.status,
      url: base ? `${base}/browse/${row.key}` : null,
    });
  }

  const subject = {
    id: `issue:${issue.key}`,
    key: issue.key,
    title: issue.summary,
    labels: issue.labels,
    parent: issue.parent?.key ?? null,
  };

  const rows = rankRelated({
    subject,
    candidates,
    limit: Math.max(1, Math.min(15, Number(input.limit) || 8)),
  });

  const markdown = [`# Related to ${key}`, renderRelated(rows)].join('\n\n');
  return { markdown, rows, graphUnavailable: graph.unavailable };
}

/** publish-dossier, the one write, and the reason a human can audit an agent. */
export async function publish({ context = {}, input = {}, deps = DEPS } = {}) {
  const key = requireKey(input.issueKey);
  const compiled = await compile({ context, input: { issueKey: key, budget: input.budget }, deps });
  const posted = await deps.jira.addDossierComment(key, {
    markdown: compiled.markdown,
    generatedAt: compiled.generatedAt,
    cap: compiled.cap,
    dropped: compiled.dropped,
  });
  return {
    ok: true,
    issueKey: key,
    commentId: posted.commentId,
    used: compiled.used,
    cap: compiled.cap,
    droppedCount: compiled.dropped.reduce((total, entry) => total + entry.count, 0),
    markdown: compiled.markdown,
  };
}
