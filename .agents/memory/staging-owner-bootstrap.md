---
name: Staging Owner bootstrap
description: Keep legacy seed behavior intact while creating a branchless first Owner through a guarded manual operation.
---

Use a separate, explicit-target maintenance operation to bootstrap the first staging Owner. It creates only one `ADMIN` with `branchId: null` and ensures the existing default `GlobalConfig`; it must refuse if an `ADMIN` or the requested username already exists. Do not replace or repurpose the legacy two-account seed unless the Owner separately approves that change.

**Why:** Existing installations may still rely on the old seed behavior, while clean staging must avoid an unwanted example branch and cashier account.

**How to apply:** Verify the isolated database target first, run the operation manually with its exact target approval, and never invoke it from API startup.
