# Plan

Codegeist 2026 entry. Deadline **22 December 2026, 12:00 pm PT**. Judging:
20% each on technological implementation, design, impact, innovation and
presentation. `$120,000` total: three Grand Prize tracks, four bonus prizes at
`$1,500 × 6` each, plus a first-come-first-served swag prize for the first 300
submissions.

## 1. What was decided, and why

**Concept, Dossier.** A token-budgeted context compiler exposed as an MCP
server. The theme is *"Build with context"* and the Software Teams track says
"give dev teams the context to ship with confidence", so the concept is
on-theme at the category level as well as the bonus level.

The mechanic: gather facts about one issue from four sources (the issue,
comments, the Teamwork Graph, sibling issues), order them by a fixed priority
ladder, and cut them to a token budget the caller names. The output states what
was dropped. That is the whole product, the tools below are the ways an agent
asks for different slices of it.

**Positioning against a sibling entry (Warrant):** Warrant decides *what an
agent may change*; Dossier decides *what an agent needs to know*. One is a
permission system, the other is a context compiler. Different verbs, different
defect classes, and they can both be entered by the same person, the rules
allow multiple unique submissions per entrant, and the same submission can win
one Grand Prize and one Bonus Prize.

**Bonus stack** (3 of 4, the same maximum stack any non-Marketplace app can
reach):

| Prize | Requirement | How this app meets it |
|---|---|---|
| Best app with Atlassian MCP, **primary** | Forge app exposing tools via `rovo:mcp` | `dossier-mcp` exposes all five actions; an open-source `SKILL.md` ships with it (the rules name that combination explicitly) |
| Best Agents, Rovo/Assignable | `rovo:agent`, `rovo:agentConnector`, or reusable `rovo:skill`/`rovo:action` | `rovo:agent` (Compiler) + `rovo:skill` (`jira-dossier`) + five `rovo:action` modules |
| Best Teamwork Graph integration | connects data into the graph **and/or consumes** the TWG API | Consumes: linked pull requests and goals per issue |
| Best Marketplace published app | Marketplace listing or review ticket | **Deliberately skipped.** Listing review has its own clock and its own reviewer queue; three bonuses is the ceiling without it |

**Category:** Apps for Software Teams.

## 2. The five tools

| Tool | Verb | Read/write | Core logic |
|---|---|---|---|
| `compile-dossier` | GET | read | priority ladder + budget trim (`domain/dossier.js`) |
| `find-related` | GET | read | TWG results blended with subject similarity, each row carrying its reason (`domain/related.js`) |
| `find-owners` | GET | read | recency-weighted ranking with half-life decay (`domain/owners.js`) |
| `what-changed` | GET | read | event windowing and grouping (`domain/changes.js`) |
| `publish-dossier` | UPDATE | **write** | posts the compiled brief as a comment, for human audit |

`domain/extract.js` does the only two pieces of "understanding" in the app:
acceptance-criteria extraction from a description heading, and decision-cue
extraction from a comment. Both return *nothing* rather than a guess, and both
are why the README can claim the dossier never invents a fact.

## 3. Build order

1. **Core, tested offline.** Pure domain modules + stub-dep service tests. No
   Forge involved. Done first because everything else is a thin wrapper on it.
2. **Adapters.** Jira REST (`asUser`) and the Teamwork Graph. Prove one real
   call on a live site before writing the UI, so a wrong normalisation is found
   when it is still cheap.
3. **Custom UI.** Issue panel + console over one resource (buildless, no
   bundler in the app path). Exists so a judge can see the product without
   configuring an MCP client, and so the video has something to film.
4. **MCP proof.** Deploy, admin-enables external exposure in Connected apps,
   then list the five tools in a real MCP client and call one. This is a
   submission requirement, not a nice-to-have, the bonus claims must be
   *visible*.
5. **Docs.** README, SUBMISSION, DEMO_VIDEO, DISTRIBUTION.
6. **Video.** Under five minutes, public on YouTube, must demonstrate the bonus
   specifics. Scripted in `docs/DEMO_VIDEO.md`.

## 4. Risks, and what each one costs

| Risk | Cost | Handling |
|---|---|---|
| `rovo:mcp` is Preview and needs an admin toggle per site | Blocks the video, not the build | Do the Connected apps step days before recording; the same step is needed on a judge's site if they want third-party exposure (they can still use Rovo Studio without it) |
| No app id until `forge register` | Deploy fails loudly until then | Step 1 of the handoff, two minutes |
| The budget estimate is not a real tokenizer | Looks weak if oversold | It is documented as a floor (4 chars/token under-counts code); the tested property is "never over the stated cap" |
| Decision-cue heuristic flags normative sentences ("must be nice") | A mislabelled quote | The quote is verbatim with author and date, so a human corrects it in one glance; the section only appears when a cue is actually found |
| Two entries from one entrant look like one idea split in two | Judging optics | Different verbs entirely (enforce vs compile); the submissions' copy should never reference each other |

## 5. What would make this win, in order of weight

1. The MCP tools work in a real client, on camera, on a real site.
2. The implementation is visibly non-trivial: a budget that is enforced and
   reported, ranking that is explained, extraction that refuses to guess.
3. The one write is defensible: publishing the brief is the audit trail, not a
   side effect.
4. Nothing in the product lies. Every missing section says so.
