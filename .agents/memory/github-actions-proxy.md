---
name: GitHub Actions via Replit proxy
description: Safe workflow dispatch through Replit's authenticated GitHub proxy when the high-level CLI command fails.
---

When `gh workflow run` fails with a proxy version-parsing error, the authenticated `gh api --method POST .../actions/workflows/{workflow}/dispatches` endpoint may still work through the same GitHub CLI authentication.

**Why:** the Replit GitHub proxy can respond differently to the CLI's high-level workflow command and direct GitHub Actions API calls; a failed CLI command does not by itself prove that a run was created.

**How to apply:** verify the repository, branch, full commit SHA, and workflow trigger first. Check the Actions run list after a failed attempt before retrying. If the user authorized dispatch and the workflow is safe, use the official authenticated API and then verify the run's repository, ref, SHA, event, workflow path, conclusion, and artifacts. Never change credentials or bypass permissions.
