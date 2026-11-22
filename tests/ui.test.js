import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The UI is the part a judge sees first, and it is the part with no runtime
// tests: a missing file or a renamed resolver action only shows up as a blank
// panel on a live site. These checks catch the wiring drift before a deploy.

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readFileSync(join(repo, 'manifest.yml'), 'utf8');
const html = readFileSync(join(repo, 'static/ui/index.html'), 'utf8');
const app = readFileSync(join(repo, 'static/ui/app.js'), 'utf8');
const bridgeEntry = readFileSync(join(repo, 'ui/bridge-entry.js'), 'utf8');

test('every resource the manifest ships exists on disk', () => {
  for (const path of ['static/ui', 'static/icons', 'static/prompt']) {
    assert.ok(existsSync(join(repo, path)), `manifest resource is missing: ${path}`);
    assert.ok(statSync(join(repo, path)).isDirectory(), `${path} must be a directory`);
  }
});

test('the panel loads the generated bridge before its own script', () => {
  assert.match(html, /<script src="vendor\/bridge\.js"><\/script>/);
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.ok(
    html.indexOf('vendor/bridge.js') < html.indexOf('src="app.js"'),
    'the bridge must be defined before app.js runs',
  );
  assert.ok(existsSync(join(repo, 'ui/bridge-entry.js')), 'the bridge entry point is missing');
  assert.match(bridgeEntry, /export const \{ invoke, view/);
});

test('the panel calls the resolver and never the Jira API directly', () => {
  assert.match(app, /invoke\('resolver'/);
  assert.doesNotMatch(app, /\/rest\/api/);
  assert.doesNotMatch(app, /@forge\/api/);
});

test('every action the panel asks for exists in the resolver', async () => {
  const index = await import('../src/index.js');
  assert.equal(typeof index.resolver, 'function');
  assert.equal(typeof index.rovo, 'function');

  const indexSource = readFileSync(join(repo, 'src/index.js'), 'utf8');
  const asked = [...app.matchAll(/action: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(asked.length > 0, 'the panel never invokes an action');
  for (const action of asked) {
    assert.ok(
      indexSource.includes(`case '${action}'`),
      `the panel asks for ${action}, which the resolver does not handle`,
    );
  }
});

test('the app icon is a real 128x128 PNG', () => {
  const icon = readFileSync(join(repo, 'static/icons/dossier.png'));
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16), 128, 'icon width');
  assert.equal(icon.readUInt32BE(20), 128, 'icon height');
});

test('the resolver exposes all five service tools to the panel', () => {
  const indexSource = readFileSync(join(repo, 'src/index.js'), 'utf8');
  for (const action of ['compile', 'related', 'owners', 'changes', 'publish']) {
    assert.match(indexSource, new RegExp(`case '${action}'`), `the resolver does not handle ${action}`);
  }
});

test('publishing is behind an explicit confirmation, not a single click', () => {
  assert.match(app, /data-act="publish-confirm"/);
  assert.match(app, /Confirm publish/);
  assert.match(app, /changes nothing else/);
  // The publish action may only be sent from doPublish, never during boot.
  const boot = app.slice(app.indexOf('async function boot'));
  assert.doesNotMatch(boot, /action: 'publish'/);
});

test('the console is a project view, not the issue panel with an empty key', () => {
  assert.match(app, /Dossier console/);
  assert.match(app, /projectKey/);
  assert.match(app, /Summarise/);
});

test('the only write path in the source is the dossier comment', () => {
  // Invariant guard: no app-level access and no other mutation verb.
  for (const file of ['src/platform/jira.js', 'src/platform/twg.js', 'src/service/dossier.js', 'src/index.js']) {
    const source = readFileSync(join(repo, file), 'utf8');
    assert.doesNotMatch(source, /\basApp\b/, `${file} must never widen access`);
  }
  const jira = readFileSync(join(repo, 'src/platform/jira.js'), 'utf8');
  assert.equal((jira.match(/method: 'POST'/g) || []).length, 1, 'exactly one POST may exist');
  assert.match(jira, /addDossierComment/);
});
