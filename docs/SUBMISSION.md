# Submission, the Devpost fields

Everything here is ready to paste. The deadline is **22 December 2026,
12:00 pm PT**. The submission form asks for a title, a text description, the
video link, an installation link with instructions, the category, the bonus
prizes, and an explanation of how the project meets the main technology
requirement.

---

## Title

**Dossier, a token-budgeted context compiler for AI agents in Jira**

## Text description

Every agent that touches Jira gets the same thing a tired engineer gets: a
ticket, a wall of comments, and a stack of linked pages. Most agents cope by
dumping all of it into their context window and guessing about the rest.

Dossier compiles the context an agent needs to work on one issue into a short,
sourced brief, and states exactly what it left out.

It runs on Atlassian Forge and exposes five tools through a `rovo:mcp` module,
so any MCP-compatible client, Rovo Studio, Claude, Cursor, or anything else
that speaks MCP, can call them:

- **compile-dossier** compiles everything about one issue inside a token budget
  (400–8000 estimated tokens, default 1500). Facts arrive in a fixed priority
  order: identity, acceptance criteria, blockers, decisions, linked pull
  requests, goals, sibling work, people. Every fact carries its source. The
  footer names what was dropped and asks for a larger budget.
- **find-related** finds the pull requests and goals attached to an issue
  through the Teamwork Graph, plus sibling work that is merely *about* the same
  thing, and says why each row surfaced, "linked in the graph", "same parent",
  "1 shared label", "shares billing, retry".
- **find-owners** ranks the people who have actually touched an issue, weighted
  by recency with a 30-day half-life. An assignment counts less than a comment,
  which counts less than a linked change. A question goes to someone with
  evidence, not to whoever was assigned last.
- **what-changed** summarises status moves, opened and resolved work, and stale
  items for a project or a JQL query inside a date window, the handover an
  agent returning to a project after two weeks actually needs.
- **publish-dossier** is the only write: it posts the compiled brief as a
  comment, so the team can audit exactly what an agent was working from.

Three properties hold the product together. The dossier never invents a fact -
if a description has no acceptance criteria heading, there is no criteria
section, and every quotation is verbatim with its author and date. The rendered
brief never estimates over its budget, the compiler trims from the tail and
reports the loss. And the dossier cannot widen anyone's reach: every read runs
as the invoking user, so a brief can only contain what that person is already
allowed to see.

An open-source `SKILL.md` ships with the app, so any third-party agent can
learn when and how to call the five tools without reading this page.

## How the project meets the main technology requirement

The app is a Forge app (runtime `nodejs22.x`, custom UI over the Forge bridge,
`@forge/api` for REST and GraphQL) that integrates with Jira and the Teamwork
Graph:

- `jira:issuePanel` and `jira:globalPage` render the compiler in the product.
- Five `rovo:action` modules are the tool surface, invoked by Rovo agents and
  by the `rovo:mcp` module.
- Jira REST v3 reads run `asUser()`, issues, comments, changelogs, JQL search
 , and one comment write publishes the brief.
- The Teamwork Graph is queried per work item ARI with curated queries for
  linked external pull requests and Atlassian goals, with per-object-type
  scopes declared in the manifest.
- Budget, ranking, extraction and rendering are pure functions in `src/domain/`
  with no Forge dependency, covered by tests that run without the platform.

## Category

**Apps for Software Teams**, the context a dev team needs to ship with
confidence, compiled for the agents now doing the work.

## Bonus prizes

### Best app with Atlassian MCP

The app declares one `rovo:mcp` module (`dossier-mcp`) exposing all five
actions as tools. External exposure is available at
`https://mcp.atlassian.com/forge/<app-id>` for any MCP-compatible client, after
a site admin enables the tools in Connected apps. The bundled `SKILL.md`
(following the Agent Skills specification, MIT-licensed) teaches third-party
agents when to compile a dossier, when to ask `find-owners` instead of
guessing, and that `publish-dossier` is the only tool that writes.

### Best Agents, Rovo/Assignable agents

A `rovo:agent` ("Compiler") is driven by a prompt that enforces one rule, read
before acting, and refuses to state a requirement from memory. Its reach is a
reusable `rovo:skill` (`jira-dossier`) backed by the five `rovo:action`
modules, so other Forge agents can attach the same skill and call the same
tools.

### Best Teamwork Graph integration

The dossier consumes the Teamwork Graph for every compile and every related-work
lookup: linked external pull requests and Atlassian goals, joined by work item
ARI. Graph failures degrade the dossier, they thin it and count as
`unavailable`, rather than breaking a tool, because a missing scope returns an
empty result rather than an error.

## Installation instructions

See `docs/DISTRIBUTION.md` for the runbook. The short version: the production
app is deployed and shareable by link; judges install from the link on the
project page with **`&product=jira`** on the end, then open an issue panel or
the console. No configuration is needed for the panel.

To exercise the MCP tools, a **site admin** must first enable external exposure
for this installation in *Apps > Sites > your site > Connected apps*; the
endpoint and the exact steps are in `docs/MCP.md`. This is a platform toggle,
not app configuration, and it is off by default.

## Submitting, in order

1. Register the app and deploy to production.
2. Create the installation link with `&product=jira` and put it on the public
   project page.
3. Record the video (`docs/DEMO_VIDEO.md`) and upload it public on YouTube.
4. Submit early: the swag prize is first come, first served for the first 300
   eligible submissions.
