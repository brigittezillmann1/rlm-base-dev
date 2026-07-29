# MCP Connector Setup — Salesforce Revenue Cloud (Quantum20)

Step-by-step guide to connect Claude Code to the Salesforce-hosted
Revenue Cloud MCP connectors used in this project.

Two connectors are used:

| Connector name            | Purpose                                        | Endpoint |
|---------------------------|------------------------------------------------|----------|
| `quantum20-rca-quoting`   | RCA quote workflows (initial / amendment / renewal, line items, discounts, approvals) | `https://api.salesforce.com/platform/mcp/v1/custom/Quantum20rcaquoting` |
| `quantum20-rca-sobject-all` | SOQL / SOSL queries, record CRUD, schema describe, relationship traversal | `https://api.salesforce.com/platform/mcp/v1/platform/sobject-all` |

Both are **remote HTTP MCP servers** authenticated with **OAuth 2.0**
against your Salesforce org. They are defined at **user scope**, so they
load in every repo/directory (no per-project config needed).

---

## Prerequisites

1. **Claude Code CLI** installed and signed in (`claude --version`).
2. **A Salesforce org** with Revenue Cloud (RLM) enabled and the
   Salesforce MCP / connected app authorized for your user.
3. **Port 8080 free** on localhost — the OAuth flow uses it as the
   redirect callback.
4. A browser available for the one-time OAuth consent screen.

---

## Option A — Add via the `claude mcp` CLI (recommended)

Run these from an interactive terminal (not from inside a Claude Code
chat session).

### 1. Add the sObject connector (user scope, HTTP transport)

```bash
claude mcp add quantum20-rca-sobject-all \
  https://api.salesforce.com/platform/mcp/v1/platform/sobject-all \
  --transport http \
  --scope user
```

### 2. Add the quoting connector

```bash
claude mcp add quantum20-rca-quoting \
  https://api.salesforce.com/platform/mcp/v1/custom/Quantum20rcaquoting \
  --transport http \
  --scope user
```

- `--transport http` → remote HTTP server (not a local stdio process).
- `--scope user` → written to `~/.claude.json` so it's available in
  every project. Use `--scope project` to instead write a shared
  `.mcp.json` into the repo, or `--scope local` for this project only.

### 3. Authorize (OAuth)

Start Claude Code, then run the MCP panel:

```bash
claude
```

Inside the session, open the MCP manager:

```
/mcp
```

Select each `quantum20-*` server and choose **Authenticate**. A browser
window opens for Salesforce login + consent; the callback returns to
`http://localhost:8080`. After approval the server shows **connected**.

### 4. Verify

```bash
claude mcp list
```

You should see both servers marked connected. Inside a session you can
confirm the tools are live, e.g. ask Claude to run `getUserInfo` on the
sObject connector — it returns your Salesforce identity.

---

## Option B — Manual config in `~/.claude.json`

If you prefer editing config directly, add this under the top-level
`mcpServers` key of `/Users/<you>/.claude.json`:

```jsonc
{
  "mcpServers": {
    "quantum20-rca-quoting": {
      "type": "http",
      "url": "https://api.salesforce.com/platform/mcp/v1/custom/Quantum20rcaquoting",
      "oauth": {
        "clientId": "<YOUR_CONNECTED_APP_CONSUMER_KEY>",
        "callbackPort": 8080
      }
    },
    "quantum20-rca-sobject-all": {
      "type": "http",
      "url": "https://api.salesforce.com/platform/mcp/v1/platform/sobject-all",
      "oauth": {
        "clientId": "<YOUR_CONNECTED_APP_CONSUMER_KEY>",
        "callbackPort": 8080
      }
    }
  }
}
```

- `clientId` is the **Consumer Key** of the Salesforce Connected App
  authorized for MCP. It is not a secret access token — the actual
  OAuth tokens are obtained at auth time and stored by Claude Code's
  credential store, not inline here.
- After saving, launch `claude`, run `/mcp`, and **Authenticate** each
  server (same as Option A step 3).

> Back up `~/.claude.json` before hand-editing — it holds your entire
> Claude Code configuration. The CLI in Option A is safer.

---

## Verification checklist

- [ ] `claude mcp list` shows both `quantum20-*` servers **connected**
- [ ] `/mcp` in-session shows them authenticated (not "needs auth")
- [ ] `getUserInfo` returns your Salesforce user/org
- [ ] A trivial read works, e.g. a `SELECT Id, Name FROM Account LIMIT 1`
      SOQL query via the sObject connector

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Browser callback fails / hangs | Port 8080 in use | Free the port, or set a different `callbackPort` and re-auth |
| Server shows "needs authentication" | OAuth not completed / token expired | Re-run `/mcp` → Authenticate |
| `401` / `403` on tool calls | Salesforce session expired or connected app not authorized for your user | Re-authenticate; confirm the connected app is approved in Salesforce Setup |
| Tools missing in a headless/cron run | Interactive OAuth servers aren't available without a login session | Run interactively, or use a non-interactive auth method for automation |
| Server not listed at all | Wrong scope | Confirm it's under `mcpServers` in `~/.claude.json` (user scope) |

---

## Notes

- These connectors are **user-scoped** and live outside this repository,
  so cloning the repo does not bring them along — each machine/user sets
  them up once.
- To remove a connector: `claude mcp remove <name>`.
- Managing MCP servers via the `claude mcp` CLI is preferred over
  hand-editing `~/.claude.json`.
