---
name: GitHub Actions via Replit proxy
description: Safe workflow dispatch through Replit's authenticated GitHub proxy when the high-level CLI command fails.
---

When `gh workflow run` fails with a proxy version-parsing error, an authenticated `gh api --method POST .../actions/workflows/{workflow}/dispatches` call may still work, but only if GitHub Actions API authentication is actually available. A successful Git push through Replit's GitHub remote does not prove that Actions API access is ready.

**Why:** Git transport and workflow dispatch use separate access paths. A branch can reach GitHub while no candidate build run can be verified.

**How to apply:** check that the GitHub integration is `ready` before using its API; verify repository, branch, full commit SHA, and workflow trigger. After any failed dispatch, inspect the run list before retrying. Verify the run's repository, ref, SHA, event, workflow path, conclusion, and artifacts. Never ask for tokens, change credentials, or bypass permissions.

Before pushing a validation branch, compare its local commits and changed files with the actual GitHub branch SHA. Replit can retain checkpoint commits or generated files locally that are not on the remote.

**Why:** blindly pushing a locally advanced branch can publish unrelated checkpoint-generated changes along with the intended candidate.

**How to apply:** inspect local branch history and worktree status, query the remote branch SHA, and push only the intended commit chain. Verify the remote SHA after pushing.
