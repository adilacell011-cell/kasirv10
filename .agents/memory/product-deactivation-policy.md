---
name: Product deactivation policy
description: Owner-approved rules for hiding discontinued products globally while preserving a safe reactivation path.
---

Use reversible global deactivation for products no longer sold anywhere. Allow deactivation only when the product's stock is zero in every branch. Preserve the product record, transaction history, and branch visibility settings; provide an Admin inactive-products list with search and an explicit reactivate action. For a product stopped in only one branch, change its branch visibility instead of deactivating it globally. Do not use the existing archive/delete action for this reversible workflow.

**Why:** the Owner chose a quick manual retirement flow from the all-branch stock view and explicitly required zero stock in every branch before deactivation, while keeping the ability to reactivate products.

**How to apply:** enforce the zero-stock condition server-side as well as in the UI, show the branch stock values in the Admin flow, and restore only the status on reactivation without changing stock or visibility.
