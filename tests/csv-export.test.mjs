import assert from "node:assert/strict";
import test from "node:test";
import { buildCsv } from "../app/csvExport.ts";

test("CSV exports income and expenses in date order with required columns", () => {
  const csv = buildCsv(
    [{ date: "2026-10-13", amount: 500, category: "Other", label: "SIP", note: "Monthly SIP" }],
    [{ date: "2026-10-12", amount: 20000, source: "Salary" }],
  );
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /"Date","Type","Amount"/);
  assert.match(lines[1], /"2026-10-12","Income","20000","Salary"/);
  assert.match(lines[2], /"2026-10-13","Expense","500","Other","SIP","Monthly SIP"/);
});

test("CSV quotes commas and prevents spreadsheet formula execution", () => {
  const csv = buildCsv([{ date: "2026-10-13", amount: 100, category: "Other", note: '=HYPERLINK("x,y")' }], []);
  assert.match(csv, /"'=HYPERLINK\(""x,y""\)"/);
});
