---
name: Database test safety
description: Treat service restarts as potentially mutating operations during restricted database audits.
---

Before restarting a service under a no-schema-change or no-data-deletion constraint, inspect its startup and scheduled maintenance paths. Do not equate “no migration command” with “no database side effects.”

**Why:** An authorized opname fix required a development API restart, which also invoked pre-existing startup DDL and summary synchronization. Those side effects were outside the intended stock-only test scope and had to be disclosed.

**How to apply:** Establish a safe startup method or request permission before a restricted audit needs a restart. Preserve production isolation; do not silently disable maintenance or alter startup behavior as part of an unrelated fix.
