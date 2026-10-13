import assert from "node:assert/strict";
import test from "node:test";
import { nextOccurrence, occurrenceDate, occurrencesThrough, recurringEntryId, validDate } from "../app/recurrence.ts";

const schedule = {
  id: "sip", type: "expense", frequency: "monthly", startDate: "2026-01-31", paused: false,
  skipDates: [], amount: 1000, category: "Other", note: "SIP", label: "SIP",
};

test("month-end recurrence stays anchored to the selected day", () => {
  assert.equal(occurrenceDate(schedule.startDate, "monthly", 1), "2026-02-28");
  assert.equal(occurrenceDate(schedule.startDate, "monthly", 2), "2026-03-31");
  assert.deepEqual(occurrencesThrough(schedule, "2026-03-31"), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("skipped, paused and resumed schedules do not produce unwanted entries", () => {
  assert.deepEqual(occurrencesThrough({ ...schedule, skipDates: ["2026-02-28"] }, "2026-03-31"), ["2026-01-31", "2026-03-31"]);
  assert.deepEqual(occurrencesThrough({ ...schedule, paused: true }, "2026-03-31"), []);
  assert.deepEqual(occurrencesThrough({ ...schedule, activeFrom: "2026-03-01" }, "2026-03-31"), ["2026-03-31"]);
  assert.equal(nextOccurrence(schedule, "2026-01-31"), "2026-02-28");
});

test("occurrence IDs are deterministic and dates reject calendar mistakes", () => {
  assert.equal(recurringEntryId("sip", "2026-02-28"), recurringEntryId("sip", "2026-02-28"));
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-02-28"), true);
});
