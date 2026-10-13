import assert from "node:assert/strict";
import test from "node:test";
import { filterExpenses, otherLabel, summarizeOther } from "../app/expenseFilters.ts";

const entries = [
  { id: "old", category: "Other", note: "SIP", amount: 1000 },
  { id: "new", category: "Other", note: "Monthly investment", label: "sip", amount: 2000 },
  { id: "gift", category: "Other", note: "Birthday", label: "Gifts", amount: 500 },
  { id: "food", category: "Food", note: "Lunch", amount: 300 },
];

test("older Other notes and new labels share one spending total", () => {
  const breakdown = summarizeOther(entries);
  assert.deepEqual(breakdown[0], ["sip", { name: "SIP", count: 2, total: 3000 }]);
  assert.equal(otherLabel({ category: "Other", note: "", amount: 100 }), "Unlabelled");
});

test("Other name filter and search combine without including other categories", () => {
  assert.deepEqual(filterExpenses(entries, "Other", "sip", "").map((item) => item.id), ["old", "new"]);
  assert.deepEqual(filterExpenses(entries, "Other", "sip", "investment").map((item) => item.id), ["new"]);
  assert.deepEqual(filterExpenses(entries, "All", null, "lunch").map((item) => item.id), ["food"]);
});
