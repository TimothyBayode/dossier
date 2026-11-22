---
name: jira-dossier
description: Compile a short, sourced context brief (a dossier) for a Jira issue, find related work, find who actually knows an area, summarise what changed in a project, and post the brief as a comment. Use before starting work on a ticket, when returning to a project after time away, or when an agent is about to act on an issue it has not read fully.
compatibility: Requires the Dossier Forge app installed on the Jira site.
license: MIT
allowed-tools: compile-dossier find-related find-owners what-changed publish-dossier
metadata:
  product: Jira
  purpose: agent context
---

# Dossier

Five tools. Four of them read, one of them writes.

`compile-dossier` is the one to reach for first. It returns a single markdown
document that fits a token budget, with every fact carrying its source and a
footer naming what did not fit. Read the footer: if it says facts were dropped,
raise `budget` (400-8000, default 1500) rather than guessing about what was cut.

Use the others one at a time:

- `find-related`, before claiming a ticket, check whether something else is
  already in flight. The reason a row was surfaced is included; a "same parent"
  row is safer than a row that only shares two words.
- `find-owners`, when a requirement is ambiguous, ask a person who has
  evidence: a comment or a linked change outranks a bare assignment.
- `what-changed`, when returning to a project after time away. Pass
  `projectKey`, or `jql` for a narrower scope, and `since` as an ISO date.
- `publish-dossier`, the only write. It posts the brief the agent was given as
  a comment, so a human can see what the agent was working from. Use it before
  starting substantial work, not as a receipt afterwards.

All reads return only what the invoking person can already see in Jira. If a
tool comes back short, the answer is a larger budget or a narrower JQL, never
an assumption.
