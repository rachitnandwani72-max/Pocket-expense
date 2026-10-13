type ExpenseRow = { date: string; amount: number; category: string; label?: string; note: string };
type IncomeRow = { date: string; amount: number; source: string };

function csvField(value: string | number) {
  const raw = String(value);
  // Spreadsheet apps can execute formulas in imported text cells.
  const safe = typeof value === "string" && /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildCsv(expenses: ExpenseRow[], incomes: IncomeRow[]) {
  const rows: (string | number)[][] = [["Date", "Type", "Amount", "Category or source", "Name within Other", "Note"]];
  for (const item of expenses) rows.push([item.date, "Expense", item.amount, item.category, item.label ?? "", item.note]);
  for (const item of incomes) rows.push([item.date, "Income", item.amount, item.source, "", ""]);
  const header = rows.shift()!;
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
}
