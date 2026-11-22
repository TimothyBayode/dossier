/**
 * Jira REST adapter.
 *
 * Reads run `asUser`, so the dossier can only contain what the person asking
 * for it is already allowed to see. That is the whole security story of this
 * app: it compiles, it does not grant.
 *
 * Every function returns plain objects, so the service layer never sees a Jira
 * JSON shape and the tests never need a fixture of one.
 */

import forgeApi from '@forge/api';

/**
 * `@forge/api` ships CommonJS with getter-defined named exports, which Node's
 * ESM loader cannot see. A default import gives the exports object in both
 * Node (tests) and Forge's esbuild bundle.
 */
const { asUser, route } = forgeApi;

const FIELDS = [
  'summary',
  'description',
  'status',
  'assignee',
  'reporter',
  'priority',
  'labels',
  'created',
  'updated',
  'parent',
  'project',
  'issuelinks',
  'duedate',
  'resolutiondate',
].join(',');

const SEARCH_FIELDS = [
  'summary',
  'status',
  'labels',
  'parent',
  'project',
  'updated',
  'created',
  'resolutiondate',
  'assignee',
  'priority',
].join(',');

async function request(path, options = {}) {
  const res = await asUser().requestJira(path, options);
  if (!res.ok) {
    const detail = await safeText(res);
    const error = new Error(`Jira ${res.status} for ${options.method || 'GET'}: ${detail}`);
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function safeText(res) {
  try {
    return String((await res.text()) || '').slice(0, 300);
  } catch {
    return '(no body)';
  }
}

export async function getIssue(key) {
  const issue = await request(route`/rest/api/3/issue/${key}?fields=${FIELDS}`);
  return normaliseIssue(issue);
}

export async function search(jql, { limit = 30, fields = SEARCH_FIELDS } = {}) {
  const path = route`/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${Math.max(1, Math.min(100, limit))}`;
  const page = await request(path);
  return (page?.issues || []).map((issue) => normaliseIssue(issue));
}

export async function getComments(key, { limit = 40 } = {}) {
  const page = await request(route`/rest/api/3/issue/${key}/comment?maxResults=${Math.max(1, Math.min(100, limit))}`);
  return (page?.comments || []).map((comment) => ({
    id: String(comment.id),
    authorId: comment.author?.accountId || null,
    authorName: comment.author?.displayName || 'Someone',
    createdAt: comment.created || null,
    body: extractText(comment.body).replace(/\n{3,}/g, '\n\n').trim(),
  }));
}

export async function getChangelog(key, { limit = 100 } = {}) {
  const page = await request(route`/rest/api/3/issue/${key}/changelog?maxResults=${Math.max(1, Math.min(100, limit))}`);
  const out = [];
  for (const history of page?.values || []) {
    for (const item of history.items || []) {
      if (item.field !== 'status') continue;
      out.push({
        field: 'status',
        from: item.fromString || null,
        to: item.toString || null,
        at: history.created || null,
        author: history.author?.displayName || null,
      });
    }
  }
  return out;
}

/** Post the compiled dossier as a comment. The only write in the app. */
export function dossierCommentAdf({ markdown, generatedAt, cap, dropped }) {
  const drops = Array.isArray(dropped) ? dropped : [];
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Dossier the agent was given' }],
      },
      { type: 'codeBlock', content: [{ type: 'text', text: String(markdown) }] },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Compiled ${generatedAt || 'just now'} for a ${cap}-token budget. ${
              drops.length
                ? `Left out: ${drops.map((entry) => `${entry.count} from ${entry.title}`).join(', ')}.`
                : 'Nothing was left out.'
            }`,
          },
        ],
      },
    ],
  };
}

export async function addDossierComment(key, payload) {
  const data = await request(route`/rest/api/3/issue/${key}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: dossierCommentAdf(payload) }),
  });
  return { issueKey: key, commentId: data?.id ? String(data.id) : null };
}

export function normaliseIssue(issue) {
  const f = issue?.fields || {};
  const descriptionText = extractText(f.description).replace(/\n{3,}/g, '\n\n').trim();
  return {
    id: issue?.id ? String(issue.id) : null,
    key: issue?.key,
    summary: f.summary || '',
    descriptionText,
    status: f.status?.name || '',
    statusCategory: f.status?.statusCategory?.name || '',
    statusId: f.status?.id ? String(f.status.id) : null,
    assignee: f.assignee?.displayName || null,
    assigneeId: f.assignee?.accountId || null,
    reporter: f.reporter?.displayName || null,
    priority: f.priority?.name || '',
    labels: Array.isArray(f.labels) ? f.labels : [],
    createdAt: f.created || null,
    updatedAt: f.updated || null,
    dueDate: f.duedate || null,
    resolutionDate: f.resolutiondate || null,
    project: f.project?.key || (issue?.key ? String(issue.key).split('-')[0] : null),
    parent: f.parent
      ? { key: f.parent.key, summary: f.parent.fields?.summary || '' }
      : null,
    links: readLinks(f.issuelinks || []),
  };
}

function readLinks(issuelinks) {
  const blocks = [];
  const blockedBy = [];
  for (const link of issuelinks) {
    const outward = link.type?.outward || '';
    const inward = link.type?.inward || '';
    if (link.outwardIssue && /block/i.test(outward) && !/is blocked/i.test(outward)) {
      if (!isDone(link.outwardIssue.fields?.status)) {
        blocks.push(linkIssue(link.outwardIssue));
      }
    }
    if (link.inwardIssue && /is blocked by/i.test(inward)) {
      if (!isDone(link.inwardIssue.fields?.status)) {
        blockedBy.push(linkIssue(link.inwardIssue));
      }
    }
  }
  return { blocks, blockedBy };
}

function linkIssue(issue) {
  return {
    key: issue.key,
    summary: issue.fields?.summary || '',
    status: issue.fields?.status?.name || '',
    updated: issue.fields?.updated || null,
  };
}

function isDone(status) {
  return /done|closed|complete/i.test(status?.statusCategory?.name || status?.name || '');
}

const BLOCK_NODES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'codeBlock',
  'blockquote',
  'panel',
  'rule',
  'table',
  'tableRow',
]);

/** Atlassian Document Format to plain text, keeping block boundaries as lines. */
export function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const inner = extractText(node.content);
  return BLOCK_NODES.has(node.type) ? `${inner}\n` : inner;
}
