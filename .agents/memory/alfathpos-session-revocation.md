---
name: AlfathPOS session revocation
description: Session continuity and account-change revocation constraints for the shared branch login
---

# Session continuity and revocation

Keep valid branch-account sessions across an API process restart when the
database and JWT signing secret remain unchanged. Revalidate the account against
the database for HTTP and Socket.IO. Revoke prior tokens after authentication
changes, but not after edits to the keeper-name roster; the current no-schema
approach uses the existing account update timestamp as a security version.

**Why:** the Owner requires an active cashier to continue after an app/server
restart, while deactivation or role/branch changes must end old access. Schema
changes are not assumed safe for the existing installation. The Owner explicitly
confirmed that changing the branch's keeper-name list must not force the shared
branch account to log in again.

**How to apply:** keep the JWT secret stable across routine restarts and do not
add a database migration without Owner approval. Profile-only keeper name edits
must preserve the security timestamp; password, role, branch, status, and account
deletion must still invalidate sessions and disconnect existing sockets. Preserve
isolated regression tests for both cases and token survival across restart.
