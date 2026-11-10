---
name: Orval Zod codegen runtime
description: Runtime compatibility issue affecting Orval's Zod generator in this workspace.
---

Orval 8.39.0's Zod generation uses `Map.groupBy`, which is unavailable in the workspace's Node 20.20 runtime.

**Why:** The API client generation can succeed while Zod generation fails, leaving generated outputs out of sync.

**How to apply:** When codegen reports `Map.groupBy is not a function`, run it with a compatible Node runtime or a temporary polyfill; do not hand-edit generated files.
