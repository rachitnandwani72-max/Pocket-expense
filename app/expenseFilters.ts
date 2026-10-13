export type ExpenseFilterItem = {
  amount: number;
  category: string;
  note: string;
  label?: string;
};

export function otherLabel(expense: ExpenseFilterItem) {
  return expense.label?.trim() || expense.note.trim() || "Unlabelled";
}

export function filterExpenses<T extends ExpenseFilterItem>(
  expenses: T[],
  category: string,
  otherName: string | null,
  search: string,
): T[] {
  const query = search.trim().toLocaleLowerCase();
  return expenses.filter((expense) => {
    if (category !== "All" && expense.category !== category) return false;
    if (category === "Other" && otherName && otherLabel(expense).toLocaleLowerCase() !== otherName) return false;
    return !query || [expense.note, expense.category, expense.label ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });
}

export function summarizeOther(expenses: ExpenseFilterItem[]) {
  const labels = new Map<string, { name: string; count: number; total: number }>();
  for (const expense of expenses) {
    if (expense.category !== "Other") continue;
    const name = otherLabel(expense);
    const key = name.toLocaleLowerCase();
    const current = labels.get(key);
    labels.set(key, {
      name: current?.name ?? name,
      count: (current?.count ?? 0) + 1,
      total: (current?.total ?? 0) + expense.amount,
    });
  }
  return [...labels.entries()].sort((a, b) => b[1].total - a[1].total);
}
