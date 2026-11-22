# AGENTS.md, the contract for whoever builds Dossier

You are building Dossier, a Codegeist 2026 entry. This file is the contract.
`docs/PLAN.md` is the plan, `docs/HANDOFF.md` is the exact state of the tree,
`docs/SUBMISSION.md` holds the Devpost copy. Read all three before writing code.

## The invariants are the submission

Three claims make this product and none of them are negotiable. Every change
must keep all three true:

1. **The dossier never invents a fact.** Every fact is gathered from Jira or
   the Teamwork Graph, every quotation is verbatim with author and date, and a
   missing section means the source had nothing, not that the code guessed.
   An invented requirement in a brief is worse than no brief.
2. **The rendered brief never estimates over the budget.** `compileDossier`
   trims from the tail until the document fits, and reports what it dropped.
   The guarantee is on the estimate (4 characters per token), which is a
   deliberate under-count for code, not a real tokenizer. Do not replace it
   with a heavier tokenizer without a reason; the property that matters is
   "never over the stated cap", and the README says so honestly.
3. **The dossier cannot widen anyone's reach.** Every read runs `asUser`. No
   `asApp` path exists in this codebase and none may be added. The single
   write, `publish-dossier`, posts a comment and nothing else, it must never
   become a transition, an assignment, or a field edit.

If a change breaks one of these, the change is wrong, not the invariant.

## Working rules

- `npm test` must pass before you commit. `npm run check` must parse clean.
  Both are cheap on a laptop and slow on a phone; run them anyway.
- Tests are the memory of the invariants. When you fix a bug, add the test that
  would have caught it. When you change an invariant, change its tests first.
- The service layer takes `deps` (jira, twg, now) so tests run without Forge.
  Never call `@forge/api` from `src/domain/`, the domain is pure by design and
  every test on it runs in milliseconds.
- `src/platform/` is the only place Jira shapes exist. A normalised issue is
  the object the rest of the code sees; keep it that way rather than passing
  raw Jira JSON upward.
- Commit in logical units with plain descriptive messages. No `feat:`/`fix:`
  prefixes. No push to a remote without the human saying the word "push".
- Never commit secrets, tokens, or a real app id tied to anything private.
  `.env` is gitignored and stays that way.

## Platform facts already verified, do not re-derive them

- `rovo:mcp` is Preview. **An app may hold at most one.** Its `tools` are
  action keys; max 50 actions; action keys under 64 characters; module name
  under 30 characters.
- External MCP exposure is **off by default**. A site or org admin must enable
  it in *Apps > Sites > your site > Connected apps*, per installation. The
  endpoint is `https://mcp.atlassian.com/forge/<app-id-uuid>`. This is the one
  step most likely to sink the demo video, schedule it before recording.
- Teamwork Graph scopes are **per object type**, and a missing scope returns an
  *empty result, not an error*. A thinner dossier is the symptom; the manifest
  scope list is the cause. The curated queries used here need
  `read:graph:issue:jira`, `read:graph:pull-request:external`,
  `read:graph:goal:atlassian`.
- The graph identifies a work item by ARI, not by issue key:
  `ari:cloud:jira:<cloudId>:issue/<issueId>`. Forge hands `cloudId` to
  different modules in different places, `cloudIdOf()` in
  `src/service/dossier.js` handles the two known shapes.
- `@forge/api` ships CommonJS with getter-defined named exports. Import it as
  `import forgeApi from '@forge/api'` and destructure. A named import works in
  Forge's bundle but breaks Node tests.
- `rovo:skill` needs a directory with a `SKILL.md`, and its frontmatter
  `allowed-tools` must list every action in `dependencies.tools`. The skill
  name must equal the directory name.
- The Forge CLI runs on an Android/Termux host; run long deploys detached
  (`setsid nohup … &`) and poll the log.
- An installation link carries `?signature=…` **and** `&product=jira`. Assert
  both before a link is published anywhere; the public site probe checks them.

## Forge module shapes (from the live manifest reference, 2026-11)

`rovo:mcp`: `key`, `name` (≤30 chars), `tools: string[]` of action keys.
`rovo:action`: `key`, `name`, `function`, `actionVerb` (GET|CREATE|UPDATE|DELETE),
`description`, `inputs: { name: { title, type, required, description } }`.
`rovo:agent`: `key`, `name`, `description`, `icon`, `prompt` (resource),
`conversationStarters`, `skills` (rovo:skill keys).
`rovo:skill`: `key`, `source: { dir }`, `dependencies: { tools: action keys }`.
`jira:issuePanel` / `jira:globalPage`: `key`, `resource`, `resolver.function`,
`title`, `icon`.
`function`: `key`, `handler` (`<file>.<export>`).
`resources`: `key`, `path`.
Scopes: `permissions.scopes`.

## Verification loop

```
npm test          # node --test --test-concurrency=1
npm run check     # esbuild parses every shipped JS file
```

Before a deploy: `forge lint`, then `forge deploy -e development`, then open the
panel on a real site once, a query that is refused looks identical to one that
returns nothing, and only `forge logs` tells them apart.
