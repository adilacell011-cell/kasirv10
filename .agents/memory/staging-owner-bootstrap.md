---
name: Staging Owner bootstrap
description: Keep legacy seed behavior intact while creating a branchless first Owner through a guarded manual operation.
---

Use a separate, explicit-target maintenance operation to bootstrap the first staging Owner. It creates only one `ADMIN` with `branchId: null` and ensures the existing default `GlobalConfig`; it must refuse if an `ADMIN` or the requested username already exists. Require both the CLI target approval and the independent `STAGING_OWNER_BOOTSTRAP_TARGET` allowlist; database names must clearly mark staging/QA/test. The allowlist belongs only in the isolated staging Compose, never the regular Dockge stack. Do not replace or repurpose the legacy two-account seed unless the Owner separately approves that change.

**Why:** Existing installations may still rely on the old seed behavior, while clean staging must avoid an unwanted example branch and cashier account.

**How to apply:** Verify the isolated database target first, run the operation manually with its exact target approval and matching allowlist, and never invoke it from API startup. The staging API may use `NODE_ENV=production` while pointing to `kasirv10_staging`; the target identity, not the runtime label alone, is the safety boundary.
