import { useState } from "react";
import { FixtureShell } from "./_FixtureShell";
import MasterProduk from "./_MasterProduk";
import { fixtureProducts } from "./fixtures";

export function MasterProducts() {
  const [searchTerm, setSearchTerm] = useState("");
  return <FixtureShell title="Master Produk"><MasterProduk products={fixtureProducts} searchTerm={searchTerm} setSearchTerm={setSearchTerm} CATEGORIES={["Pulsa", "Aksesoris", "Voucher"]} startEditing={() => {}} navigateTo={() => {}} /></FixtureShell>;
}
