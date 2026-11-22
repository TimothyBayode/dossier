# Dossier

A token-budgeted context compiler for AI agents working in Jira, exposed as an
MCP server on Forge.

Agents get the same Jira an exhausted engineer gets: the ticket, a wall of
comments, a stack of linked pages. Most agents cope by dumping it into their
context window and guessing about the rest. Dossier compiles the context an
agent needs to work on one issue into a short, sourced brief, and states
exactly what it left out.

> Every agent deserves a brief, not a dump.

Built for [Codegeist 2026](https://codegeist2026.devpost.com/) on Atlassian
Forge. Five tools, four of them read and one of them writes, all exposed through
a `rovo:mcp` module so any MCP-compatible client, Rovo Studio, Claude, Cursor,
anything that speaks MCP, can call them.

| Tool | What it does |
|---|---|
| `compile-dossier` | Everything about one issue inside a token budget (400–8000 estimated tokens), every fact carrying its source, a footer naming what was cut |
| `find-related` | Pull requests, goals and sibling issues connected to one issue, formally via the Teamwork Graph, or by subject, each with the reason it was surfaced |
| `find-owners` | Who to ask about an issue, ranked by who has *touched* the work, weighted by a half-life decay. An assignment counts less than a comment, which counts less than a linked change |
| `what-changed` | Status moves, opened and resolved work, and stale items for a project or JQL query inside a date window |
| `publish-dossier` | The only write. Posts the compiled brief as a Jira comment, so the team can audit exactly what an agent was working from |

## The three properties this lives or dies by

1. **The dossier never invents a fact.** If a description has no acceptance
   criteria heading, the dossier has no criteria section. If no comment reads
   like a decision, there is no decisions section. Quoted speech is verbatim,
   with the author and the date attached.
2. **The rendered brief never estimates over the budget.** The compiler trims
   from the tail until the document fits, and the footer says what was dropped.
   An agent that knows a brief is partial asks for more or stops; an agent
   handed a "complete" dump guesses.
3. **The dossier cannot widen anyone's reach.** Every read runs `asUser`, so a
   brief can only contain what the person asking is already allowed to see.

## Status

In build. `docs/HANDOFF.md` has the exact state, and `docs/PLAN.md` has the
rest of the plan. Submission target: Codegeist 2026, deadline 22 December 2026,
12:00 pm PT.
