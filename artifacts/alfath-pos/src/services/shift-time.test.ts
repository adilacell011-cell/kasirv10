import assert from "node:assert/strict";
import test from "node:test";
import { isShiftOverdue } from "./shift-time";

const cases: [string, string, string, boolean][] = [
  ["Pagi", "2026-11-03T06:40:00+07:00", "2026-11-03T06:50:00+07:00", false],
  ["Pagi", "2026-11-03T06:40:00+07:00", "2026-11-03T19:00:00+07:00", true],
  ["Pagi", "2026-11-03T07:00:00+07:00", "2026-11-03T19:20:00+07:00", true],
  ["Malam", "2026-11-02T19:20:00+07:00", "2026-11-03T06:40:00+07:00", false],
  ["Malam", "2026-11-02T19:20:00+07:00", "2026-11-03T07:00:00+07:00", true],
  ["Malam", "2026-11-03T18:40:00+07:00", "2026-11-03T18:50:00+07:00", false],
  ["Malam", "2026-11-02T19:20:00+07:00", "2026-11-04T01:00:00+07:00", true],
];
for (const [type, opened, now, expected] of cases) {
  test(`${type} opened ${opened}, checked ${now}: overdue=${expected}`, () => {
    assert.equal(isShiftOverdue(type, opened, new Date(now)), expected);
  });
}
test("unknown or missing shift does not create a schedule restriction", () => {
  assert.equal(isShiftOverdue("Pagi", null), false);
  assert.equal(isShiftOverdue("Pagi", "bad-date"), false);
  assert.equal(isShiftOverdue("Unknown", "2026-11-03T07:00:00+07:00"), false);
});
