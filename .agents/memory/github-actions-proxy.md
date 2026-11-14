---
name: GitHub Actions via Replit proxy
description: Safe workflow dispatch through Replit's authenticated GitHub proxy when the high-level CLI command fails.
---

When `gh workflow run` fails with a proxy version-parsing error, an authenticated `gh api --method POST .../actions/workflows/{workflow}/dispatches` call may still work, but only if GitHub Actions API authentication is actually available. A successful Git push through Replit's GitHub remote does not prove that Actions API access is ready.

**Why:** Git transport and workflow dispatch use separate access paths. A branch can reach GitHub while no candidate build run can be verified.

**How to apply:** check that the GitHub integration is `ready` before using its API; verify repository, branch, full commit SHA, and workflow trigger. After any failed dispatch, inspect the run list before retrying. Verify the run's repository, ref, SHA, event, workflow path, conclusion, and artifacts. Never ask for tokens, change credentials, or bypass permissions.
