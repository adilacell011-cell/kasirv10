---
name: Imported artifact registration
description: Recover imported artifact services when their metadata exists but the artifact and workflow lists are empty.
---

An imported workspace can contain valid artifact metadata while the platform lists no artifacts or workflows. Revalidate the existing metadata through `verifyAndReplaceArtifactToml` using an identical temporary copy before attempting to recreate apps or configure replacement workflows.

**Why:** On an AlfathPOS import, validated replacement of existing metadata caused the platform to discover the imported artifacts and generate their managed workflows, without restructuring or scaffolding over the existing application.

**How to apply:** When artifact files exist but `listArtifacts` is empty, validate the existing metadata and check the artifact and workflow lists again. Preserve IDs, service commands, and routing. Start only the services needed for the user's request.