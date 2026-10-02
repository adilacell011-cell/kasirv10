---
name: Imported API codegen compatibility
description: Orval compatibility pitfalls with the imported workspace's runtime and dependency versions.
---

Orval's newer generator can assume newer Node and Zod defaults than this imported workspace provides. In the observed Node 20 environment, codegen failed because Map.groupBy was unavailable; output also defaulted to Zod 4 while the workspace uses Zod 3.

**Why:** A failed clean generation removes existing generated files, and an incorrect target produces validators that do not compile with installed libraries.

**How to apply:** Confirm the runtime supports generator built-ins before codegen. Use a compatible generator runtime or a process-local compatibility shim rather than changing the app runtime implicitly. Pin generated Zod and React Query targets to the versions actually installed. Regenerate both clients and validators, and check shared libraries after generation.