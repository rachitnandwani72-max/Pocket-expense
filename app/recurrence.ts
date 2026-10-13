export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export type RecurringSchedule = {
  id: string;
  type: "expense" | "income";
  frequency: Frequency;
  startDate: string;
  activeFrom?: string;
  paused: boolean;
  skipDates: string[];
  amount: number;
  category?: string;
  note?: string;
  label?: string;
  source?: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function validDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function occurrenceDate(startDate: string, frequency: Frequency, index: number) {
  if (!validDate(startDate) || !Number.isInteger(index) || index < 0) return null;
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (frequency === "daily" || frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + index * (frequency === "weekly" ? 7 : 1));
  } else {
    const target = new Date(Date.UTC(year + (frequency === "yearly" ? index : 0), month - 1 + (frequency === "monthly" ? index : 0), 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return dateKey(target);
  }
  return dateKey(date);
}

export function occurrencesThrough(schedule: RecurringSchedule, throughDate: string) {
  if (!validDate(throughDate) || !validDate(schedule.startDate) || schedule.paused) return [];
  const dates: string[] = [];
  // A hard cap prevents a damaged or very old schedule from locking the app.
  for (let index = 0; index < 3650; index += 1) {
    const date = occurrenceDate(schedule.startDate, schedule.frequency, index);
    if (!date || date > throughDate) break;
    if ((!schedule.activeFrom || date >= schedule.activeFrom) && !schedule.skipDates.includes(date)) dates.push(date);
  }
  return dates;
}

export function nextOccurrence(schedule: RecurringSchedule, afterDate: string) {
  if (!validDate(afterDate) || !validDate(schedule.startDate)) return null;
  for (let index = 0; index < 3650; index += 1) {
    const date = occurrenceDate(schedule.startDate, schedule.frequency, index);
    if (!date) break;
    if (date > afterDate && (!schedule.activeFrom || date >= schedule.activeFrom) && !schedule.skipDates.includes(date)) return date;
  }
  return null;
}

export function recurringEntryId(scheduleId: string, date: string) {
  return `recurring:${scheduleId}:${date}`;
}
