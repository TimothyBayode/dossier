# MCP proof runbook

The MCP bonus requires footage of the tools **listed in a real client and
actually called**. This is the checklist for getting to that state, and for
diagnosing the two ways it silently fails.

## The endpoint

```
https://mcp.atlassian.com/forge/7d47fbd2-2e74-42ab-b5bb-027d1033a6ae
```

The UUID is the app id from `manifest.yml` (`app.id`, after the last `/`). If the
app is redeployed under a new id, this URL changes.

## 1. Enable external exposure (site admin, per installation)

External MCP is **off by default**. Until this is done, the endpoint will connect
but expose no tools.

1. Go to <https://admin.atlassian.com>.
2. **Apps → Sites → your site → Connected apps**.
3. Find the Dossier app, open its details.
4. Turn on the tools you want to expose (all five).

This is per app installation, per site. A judge installing on their own site is
their own admin and must repeat it — say so in the submission instructions.

## 2. Connect a client

Any MCP-compatible client works. The shape is the same everywhere:

```json
{
  "mcpServers": {
    "dossier": {
      "type": "http",
      "url": "https://mcp.atlassian.com/forge/7d47fbd2-2e74-42ab-b5bb-027d1033a6ae"
    }
  }
}
```

Some clients use `"url"` without `"type"`; Claude Desktop and older clients may
need an `mcp-remote` bridge. On connect, an OAuth consent screen asks which site
to use (only sites where the app is installed and exposure is on), then shows
the requested scopes.

## 3. The five calls, in video order

| Call | Pass condition |
|---|---|
| list tools | Exactly five: `compile-dossier`, `find-related`, `find-owners`, `what-changed`, `publish-dossier` |
| `compile-dossier` on a busy issue | Sections appear in priority order, a verbatim decision quote with author and date, and the footer names what was dropped |
| `find-owners` | People ranked with evidence ("commented 2 days ago"), not just the assignee |
| `find-related` | At least one row says *why* it surfaced (graph link, shared label, shared parent) |
| `publish-dossier` | The comment appears on the issue with the brief inside a code block and the budget footer |

`what-changed` is the fifth tool; it is the one to call if the demo issue is in
a project with recent status moves.

## 4. If something is wrong

**Tools missing after connecting.** Exposure is off for this installation, or
you connected to a site where the app is not installed. Recheck step 1.

**`compile-dossier` returns a thin dossier.** The graph degrades to an empty
result when a scope is missing; it does not raise. Check:

```
forge logs -e development -s 15m -n 200
```

Look for `[dossier] graph ... failed`. A scope problem names the object type.
The curated queries need `read:graph:issue:jira`,
`read:graph:pull-request:external`, `read:graph:goal:atlassian`.

**401 or a consent loop.** The OAuth token is scoped to the invoking user. Sign
out of the client and reconnect, choosing the correct site.

**Panel loads but every section is empty.** Open the issue once in the browser;
a `403` from Jira REST means the installed app is missing a scope, not that the
issue is empty.

## 5. Before recording

- Deploy to production (`forge deploy -e production`), not only development.
- Install from the shared link on a site the judge can reach.
- Run every call once, cold, so OAuth and any cold-start delay happen off camera.
- Keep `forge logs` open in another window during the recording.
