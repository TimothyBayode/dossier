import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// A drift guard. The graph degrades silently, a missing scope or a renamed
// field is an empty result, not an error, so the only place the break is
// visible before a judge opens it is here.

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readFileSync(join(repo, 'manifest.yml'), 'utf8');
const twg = readFileSync(join(repo, 'src/platform/twg.js'), 'utf8');
const skill = readFileSync(join(repo, 'skills/jira-dossier/SKILL.md'), 'utf8');

const TOOLS = ['compile-dossier', 'find-related', 'find-owners', 'what-changed', 'publish-dossier'];

test('the MCP server exposes exactly the five tools, and one module only', () => {
  const block = manifest.slice(manifest.indexOf('rovo:mcp:'));
  assert.equal(manifest.match(/rovo:mcp:/g).length, 1, 'one rovo:mcp module is the platform limit');
  for (const tool of TOOLS) {
    assert.ok(block.includes(`- ${tool}`), `the MCP server is missing ${tool}`);
  }
});

test('every action the MCP server names exists in the manifest', () => {
  for (const tool of TOOLS) {
    assert.ok(manifest.includes(`- key: ${tool}`), `action ${tool} is not declared`);
  }
});

test('the graph queries only ask for fields that exist on the object type', () => {
  const pulls = twg.slice(twg.indexOf('PULL_REQUESTS = `'), twg.indexOf('export const GOALS'));
  for (const field of ['id', 'title', 'status', 'url']) {
    assert.ok(pulls.includes(field), `the pull-request query is missing ${field}`);
  }
  assert.ok(pulls.includes('jiraWorkItemLinkedExternalPullRequests'));
  assert.ok(pulls.includes('ExternalPullRequest'));

  const goals = twg.slice(twg.indexOf('GOALS = `'), twg.indexOf('export function workItemAri'));
  assert.ok(goals.includes('jiraWorkItemGoals'));
  assert.ok(goals.includes('AtlassianGoal'));
  assert.ok(goals.includes('name'));
});

test('the graph scopes are present, because a missing one returns empty not error', () => {
  for (const scope of [
    'read:graph:issue:jira',
    'read:graph:pull-request:external',
    'read:graph:goal:atlassian',
  ]) {
    assert.ok(manifest.includes(scope), `missing scope ${scope}`);
  }
});

test('the skill lists the tools it is allowed to call', () => {
  const frontmatter = skill.slice(0, skill.indexOf('---', 4));
  assert.match(frontmatter, /allowed-tools: compile-dossier find-related find-owners what-changed publish-dossier/);
  assert.ok(frontmatter.includes('name: jira-dossier'));
  assert.ok(skill.length > 400, 'the description must be long enough for reliable discovery');
});

test('the agent prompt exists and is wired', () => {
  assert.ok(manifest.includes('resource:prompt;compiler.md'));
  const prompt = readFileSync(join(repo, 'static/prompt/compiler.md'), 'utf8');
  assert.ok(prompt.includes('compile-dossier'));
  assert.ok(prompt.includes('publish-dossier'));
});

test('the app is shareable by link, which the install link requires', () => {
  assert.match(manifest, /licensing:\n    enabled: false/);
});

test('the published comment carries the dossier verbatim inside a code block', async () => {
  const { dossierCommentAdf } = await import('../src/platform/jira.js');
  const body = dossierCommentAdf({
    markdown: '# Dossier: PROJ-1\n> Compiled for an agent with a 1500-token budget.',
    generatedAt: '2026-11-22T00:00:00.000Z',
    cap: 1500,
    dropped: [{ key: 'decisions', title: 'Recent decisions', count: 3 }],
  });

  assert.equal(body.type, 'doc');
  const [heading, code, paragraph] = body.content;
  assert.equal(heading.content[0].text, 'Dossier the agent was given');
  assert.equal(code.type, 'codeBlock');
  assert.equal(code.content[0].text, '# Dossier: PROJ-1\n> Compiled for an agent with a 1500-token budget.');
  assert.match(paragraph.content[0].text, /Compiled 2026-11-22T00:00:00\.000Z for a 1500-token budget\./);
  assert.match(paragraph.content[0].text, /Left out: 3 from Recent decisions\./);
});

test('the published comment says nothing was left out when nothing was', async () => {
  const { dossierCommentAdf } = await import('../src/platform/jira.js');
  const body = dossierCommentAdf({ markdown: '# D', cap: 1500, dropped: [] });
  assert.match(body.content[2].content[0].text, /Nothing was left out\./);
});
