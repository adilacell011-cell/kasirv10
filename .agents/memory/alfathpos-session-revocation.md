---
name: AlfathPOS session revocation
description: Session continuity and account-change revocation constraints for the shared branch login
---

# Session continuity and revocation

Keep valid branch-account sessions across an API process restart when the
database and JWT signing secret remain unchanged. Revalidate the account against
the database for HTTP and Socket.IO, and revoke prior tokens after a user-record
edit; the current no-schema approach uses the existing account update timestamp.

**Why:** the Owner requires an active cashier to continue after an app/server
restart, while deactivation or role/branch changes must end old access. Schema
changes are not assumed safe for the existing installation. Because the account
timestamp also changes for profile/roster edits, those edits currently require
the shared account to log in again; the open shift and its data remain stored.

**How to apply:** keep the JWT secret stable across routine restarts and do not
add a database migration without Owner approval. Preserve isolated tests for
token invalidation on status/role/branch edits and token survival across restart.
