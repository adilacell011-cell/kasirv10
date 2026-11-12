import assert from "node:assert/strict";
import { test } from "node:test";
import { getUnresolvedTransferDiscrepancyQty } from "./stock-transfer-discrepancy";

test("keeps a received quantity mismatch visible as an unresolved difference", () => {
  assert.equal(
    getUnresolvedTransferDiscrepancyQty({
      status: "RECEIVED",
      dispatchedQty: 3,
      receivedQty: 2,
    }),
    1,
  );
});

test("does not mark matching receipts or unconfirmed shipments as discrepancies", () => {
  assert.equal(
    getUnresolvedTransferDiscrepancyQty({
      status: "RECEIVED",
      dispatchedQty: 3,
      receivedQty: 3,
    }),
    0,
  );
  assert.equal(
    getUnresolvedTransferDiscrepancyQty({
      status: "IN_TRANSIT",
      dispatchedQty: 3,
      receivedQty: null,
    }),
    0,
  );
});

test("treats a zero-unit receipt as a full unresolved discrepancy", () => {
  assert.equal(
    getUnresolvedTransferDiscrepancyQty({
      status: "RECEIVED",
      dispatchedQty: 3,
      receivedQty: 0,
    }),
    3,
  );
});
