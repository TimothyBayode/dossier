# Distribution, how a judge installs Dossier

The submission requires "an installation link … for the judges". This is the
runbook for producing one that works.

---

## 1. What must be true before the console will hand out a link

| Thing | Why | State |
|---|---|---|
| Deployed to production | the console shares a *version* | needs `forge deploy -e production` |
| No `license` block in the manifest (`licensing.enabled: false`) | a licensed or Marketplace-submitted app **cannot** be link-shared | already in `manifest.yml` |
| A public support URL | the five-field form requires one | the repo's issues page, once public |
| A public privacy policy URL | same | needs a page before submission |
| The app is **not** published to Marketplace | a listing takes the app off the shareable path | not published, deliberate |

## 2. The one step that needs a human in a browser

There is no CLI command and no API for this. Open, signed in as the app owner:

```
https://developer.atlassian.com/console/myapps/<app-id>/manage/distribution
```

1. **Distribution controls → Edit**.
2. Choose **Sharing**, *not* "Sharing within organization". Judges are outside
   any organization, and org-sharing refuses them even with the link.
3. Fill the form:

| Field | Value |
|---|---|
| Company / department | `Baseline` |
| Support contact | the public issues URL |
| Privacy policy | the public privacy page URL |
| Does the app store personal data? | **Yes**, display names appear on published dossiers and owner rankings, because who touched the work is the point. Nothing else is stored, and nothing leaves Atlassian. |
| Atlassian apps | **Jira only**. Ticking Confluence too restricts installs to sites running both. |

4. Save and copy the link.

## 3. What a working link carries

A link a judge can open has two query parameters:

- `?signature=`, the console's signature envelope
- `&product=jira`, the product the install targets

Assert both before the link goes anywhere public: it is on the project page, in
the Devpost submission field, and in the site probe, which refuses to pass a
link that is missing either parameter. The console generates links in this
form.

## 4. After the link exists

- Put it on the public project page, labelled "Install Dossier".
- Put it in the Devpost submission's installation-instructions field.
- The video end card carries the short project-page URL, not the 130-character
  link, a judge cannot type that from a 1920-wide frame.

## 5. External MCP exposure (separate from installation, and load-bearing)

Installing the app is not the same as exposing its tools to third-party MCP
clients. A site or org admin must go to **Apps > Sites > your site > Connected
apps**, select the Dossier app, and switch on the tools. That is per
installation, and until it is on, `https://mcp.atlassian.com/forge/<app-id>`
lists nothing to an external client, which is exactly what the demo video
needs to show working.

A judge who installs the app and opens the issue panel sees the product without
that step. A judge who wants to call the tools from Claude or Cursor needs it.
Do it on the demo site before recording; mention it in the submission's
instructions so a judge can do it on theirs.
