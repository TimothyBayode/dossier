# Demo video, the script

Under five minutes, public on YouTube. The rules require footage that shows the
project functioning, and they require demonstrating the specifics of any bonus
prize claimed, which means the MCP tools must be shown **listed in a real MCP
client and actually called**, not described.

Target 3:30–4:00. The spine is the moment an agent stops guessing, not a
feature tour.

## Pre-flight (do this days before recording)

1. Deploy to production; install on a real site; open the panel once so the
   graph queries have run at least once for real.
2. **Enable external MCP exposure** in *Apps > Sites > your site > Connected
   apps*, the tools are invisible to third-party clients until this is on.
   Do it before recording starts.
3. Pick an issue that has a description with an acceptance-criteria heading, a
   couple of comments (at least one that reads like a decision), a linked pull
   request, and a sibling in the same project. Seed one if nothing matches.
4. Have an MCP client connected to `https://mcp.atlassian.com/forge/<app-id>`
   and authorised, with the five tools visible, before the screen recorder
   starts.

## The shots

| Time | On screen | Say |
|---|---|---|
| 0:00–0:25 | A Jira issue with 30 comments and three linked pages | "An agent that is asked to work on this gets a dump, not a brief. It guesses about the rest." |
| 0:25–1:10 | MCP client, tool list | "Five tools, exposed through one Rovo MCP module. Four read, one writes." |
| 1:10–2:20 | Call `compile-dossier` on the busy issue | "1,212 of 1,500 tokens. Acceptance criteria from the description, the decision quoted verbatim with a name and a date, the pull request from the Teamwork Graph. And the footer: what was left out." |
| 2:20–2:50 | Call `find-owners` | "Ranked by who touched it. Bob commented yesterday; the assignment went stale a month ago." |
| 2:50–3:20 | Call `find-related`, point at the `why` strings | "The graph says what is formally linked. This also finds the work that is merely about the same thing, and says why each row surfaced." |
| 3:20–3:50 | Call `publish-dossier`, then show the comment in Jira | "One write: the brief the agent was given, posted where the team can read it. That is the audit trail." |
| 3:50–4:00 | The budget footer in the Jira comment | "Nothing invented, nothing over budget, nothing beyond the person who asked." |

## Rules the edit must keep

- The MCP tool list and one real call must be on screen. A mocked client is a
  bonus claim that cannot be verified.
- The budget footer must be legible for at least two seconds, it is the
  differentiator, not a detail.
- No third-party trademarks or copyrighted music.
- If a section is missing in the demo issue (no criteria heading), show it and
  say it: "no criteria are recorded, so there is no criteria section." That is
  the honesty property, and it demos better than a full dossier.

## Graphics budget

Under 25 seconds of motion graphics total: one title card, one lower-third per
bonus lane (MCP, Rovo agent + skill, Teamwork Graph), one end card with the
project page URL. The product is the proof; the graphics are labels.
