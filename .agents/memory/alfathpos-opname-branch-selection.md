---
name: Opname branch selection
description: Owner-approved default and persistence behavior for the stock Opname target branch.
---

For the Opname stock-management page, start with no target branch selected. Persist the user's chosen branch per account across refreshes, and preserve an intentional empty selection instead of auto-selecting the first or assigned branch. Stock actions remain unavailable until a branch is selected.

**Why:** the Owner wants to prevent accidental work against the wrong branch and needs the selected branch to remain stable after refresh, while still being able to clear it.

**How to apply:** validate a saved branch against the current branch list before restoring it; scope browser preference by user ID. Keep this as UI selection state and do not change API authorization, database behavior, or stock handlers.
