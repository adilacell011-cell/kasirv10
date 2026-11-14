import assert from "node:assert/strict";
import test from "node:test";
import { approveMaintenance } from "./maintenance-cli";

const target = {
  environment: "test",
  host: "127.0.0.1",
  port: "55432",
  database: "product_sales_summary_test",
  schema: "public",
} as const;

test("product-sales-summary backfill requires explicit target approval", () => {
  assert.throws(
    () => approveMaintenance(["backfill-product-sales-summary"], target),
    /Explicit operation/,
  );
  assert.equal(
    approveMaintenance([
      "backfill-product-sales-summary",
      "--execute",
      "--acknowledge-legacy-risks",
      "--approve=backfill-product-sales-summary:test:127.0.0.1:55432/product_sales_summary_test/public",
    ], target),
    "backfill-product-sales-summary",
  );
});
