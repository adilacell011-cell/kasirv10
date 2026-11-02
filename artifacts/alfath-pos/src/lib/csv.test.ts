import test from "node:test";
import assert from "node:assert/strict";
import { toCsvRow } from "./csv";

// Decode CSV with embedded separators/newlines, not line.split(",").
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === "," || ch === "\n")) {
      row.push(field); field = "";
      if (ch === "\n") { rows.push(row); row = []; }
    } else field += ch;
  }
  assert.equal(quoted, false, "CSV quotes must be balanced");
  row.push(field); rows.push(row);
  return rows;
}

test("H2: ordinary values and numeric conversion remain unchanged", () => {
  assert.equal(toCsvRow(["Tanggal", "Cabang", "Kasir Pagi", "Rp Pagi", "Kasir Malam", "Rp Malam", "Total Harian"]),
    "Tanggal,Cabang,Kasir Pagi,Rp Pagi,Kasir Malam,Rp Malam,Total Harian");
  assert.equal(toCsvRow(["2026-11-02", "QA", "Pagi", 31000, "Malam", 23000, 54000]),
    "2026-11-02,QA,Pagi,31000,Malam,23000,54000");
  assert.equal(toCsvRow([0, -1000, 12.5, ""]), "0,-1000,12.5,");
});

test("H2: comma, quotes and CR/LF round-trip without shifting seven columns", () => {
  const cases = ["QA, Cabang", 'QA "Cabang"', "QA\nCabang", "QA\rCabang", 'QA, "Cabang"\r\nDua'];
  for (const name of cases) {
    const values = ["2026-11-02", name, name, 31000, name, 23000, 54000];
    const decoded = parseCsv(toCsvRow(values));
    assert.equal(decoded.length, 1);
    assert.equal(decoded[0].length, 7);
    assert.deepEqual(decoded[0], values.map(String));
  }
});

test("H2: multiple records preserve Unicode names, row order and totals", () => {
  const rows = [
    ["2026-11-02", 'Cabang, "A"', "Kasir\nPagi", 31000, "Kasir Malam", 23000, 54000],
    ["2026-11-01", "Cabang B – Bandung", "Kasir B", 8000, "", 0, 8000],
  ];
  const decoded = parseCsv(rows.map(toCsvRow).join("\n"));
  assert.deepEqual(decoded, rows.map(row => row.map(String)));
  assert.equal(decoded.reduce((sum, row) => sum + Number(row[6]), 0), 62000);
});
