import { useState } from "react";
import BranchStockAuditPage, { type AuditBranch } from "./_BranchStockAuditPage";
import { auditFixtureApi } from "./auditFixtureApi";
import { FixtureShell } from "./_FixtureShell";

const branches: AuditBranch[] = [
  { id: "branch-cendana", name: "Cendana" },
  { id: "branch-puspa", name: "Puspa Indah" },
  { id: "branch-meranti", name: "Meranti" },
];

export function BranchStockAudit() {
  // Seed only the fixture iframe's scoped URL so the extracted page opens on
  // its fictional branch; the copied component handles subsequent selection.
  const [urlReady] = useState(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("auditBranchId")) {
        url.searchParams.set("auditBranchId", branches[0].id);
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
    return true;
  });
  void urlReady;
  return (
    <FixtureShell title="Audit Stok Cabang">
      <BranchStockAuditPage
        branches={branches}
        role="ADMIN"
        userId="fixture-audit-user"
        api={auditFixtureApi}
      />
    </FixtureShell>
  );
}
