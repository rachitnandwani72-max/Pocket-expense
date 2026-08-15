"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Category =
  | "Food"
  | "Travel"
  | "Shopping"
  | "Bills"
  | "Health"
  | "Other"
  | "Petrol"
  | "Recharge";

type LedgerFilter = Category | "All";

type Expense = {
  id: string;
  amount: number;
  category: Category;
  note: string;
  date: string;
};

type Theme = "light" | "dark";
type AppView = "home" | "transactions" | "reports";

type PocketBackup = {
  app: "Pocket";
  version: 1;
  exportedAt: string;
  data: {
    expenses: Expense[];
    targets: Record<string, number>;
    openingBalances?: Record<string, number>;
    ownerName: string;
    targetAlertsEnabled: boolean;
    theme: Theme;
  };
};

const categories: { name: Category; icon: string; color: string }[] = [
  { name: "Food", icon: "🍜", color: "#ff8f6b" },
  { name: "Travel", icon: "🛺", color: "#58a6d6" },
  { name: "Shopping", icon: "🛍️", color: "#ad86d9" },
  { name: "Bills", icon: "🧾", color: "#e8b04d" },
  { name: "Health", icon: "🩺", color: "#63b891" },
  { name: "Recharge", icon: "📱", color: "#5d9ed8" },
  { name: "Petrol", icon: "⛽", color: "#e56b5d" },
  { name: "Other", icon: "✨", color: "#8a94a6" },
];

const categoryNames = new Set<Category>(categories.map((item) => item.name));
const expenseStorageKey = "pocket-expenses-v3";
const targetStorageKey = "pocket-budgets-v3";
const openingBalanceStorageKey = "pocket-opening-balances-v1";
const monthlyPlanMigrationKey = "pocket-monthly-plan-v1-migrated";
const targetAlertsStorageKey = "pocket-target-alerts";
const ownerNameStorageKey = "pocket-owner-name";
const lastBackupStorageKey = "pocket-last-backup";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const today = () => localDateKey();

const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + delta, 1));
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function expenseDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function groupDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T12:00:00`));
}

function parseExpense(value: unknown): Expense | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Omit<Expense, "category">> & { category?: unknown };
  const category = candidate.category === "Drinks & Smoking" ? "Other" : candidate.category;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.amount !== "number" ||
    !Number.isFinite(candidate.amount) ||
    candidate.amount <= 0 ||
    typeof category !== "string" ||
    !categoryNames.has(category as Category) ||
    typeof candidate.note !== "string" ||
    typeof candidate.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)
  ) return null;

  return {
    id: candidate.id,
    amount: candidate.amount,
    category: category as Category,
    note: candidate.note,
    date: candidate.date,
  };
}

function loadSavedExpenses() {
  const keys = new Set<string>(["pocket-expenses", expenseStorageKey]);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && /^pocket-.+-expenses$/.test(key)) keys.add(key);
  }

  const byId = new Map<string, Expense>();
  for (const key of keys) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) continue;
      parsed.forEach((value) => {
        const expense = parseExpense(value);
        if (expense) byId.set(expense.id, expense);
      });
    } catch {
      // Keep the valid ledger even when one older entry is damaged.
    }
  }

  const migrated = Array.from(byId.values());
  localStorage.setItem(expenseStorageKey, JSON.stringify(migrated));
  return migrated;
}

function loadSavedTargets() {
  const keys = new Set<string>(["pocket-budgets", targetStorageKey]);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && /^pocket-.+-budgets$/.test(key)) keys.add(key);
  }

  const migrated: Record<string, number> = {};
  for (const key of keys) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      for (const [month, value] of Object.entries(parsed)) {
        if (/^\d{4}-\d{2}$/.test(month) && typeof value === "number" && value > 0) {
          migrated[month] = value;
        }
      }
    } catch {
      // Keep the valid targets even when one older value is damaged.
    }
  }

  localStorage.setItem(targetStorageKey, JSON.stringify(migrated));
  return migrated;
}

function loadSavedOpeningBalances() {
  const migrated: Record<string, number> = {};
  try {
    const stored = localStorage.getItem(openingBalanceStorageKey);
    if (!stored) return migrated;
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    for (const [month, value] of Object.entries(parsed)) {
      if (/^\d{4}-\d{2}$/.test(month) && typeof value === "number" && Number.isFinite(value) && value > 0) {
        migrated[month] = value;
      }
    }
  } catch {
    // Keep the app usable if one saved opening balance is damaged.
  }
  return migrated;
}

function parseMonthlyAmounts(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed: Record<string, number> = {};
  for (const [month, amount] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}$/.test(month) || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    parsed[month] = amount;
  }
  return parsed;
}

function parseBackup(value: unknown): PocketBackup["data"] | null {
  if (!value || typeof value !== "object") return null;
  const backup = value as Partial<PocketBackup>;
  if (backup.app !== "Pocket" || backup.version !== 1 || !backup.data || typeof backup.data !== "object") {
    return null;
  }

  const data = backup.data as Partial<PocketBackup["data"]>;
  if (!Array.isArray(data.expenses)) return null;
  const expenses = data.expenses.map(parseExpense);
  if (expenses.some((expense) => !expense)) return null;
  const savedTargets = parseMonthlyAmounts(data.targets);
  if (!savedTargets) return null;
  const hasOpeningBalances = data.openingBalances !== undefined;
  const savedOpeningBalances = hasOpeningBalances ? parseMonthlyAmounts(data.openingBalances) : savedTargets;
  if (!savedOpeningBalances) return null;
  const targets = hasOpeningBalances ? savedTargets : {};

  const ownerName = typeof data.ownerName === "string" ? data.ownerName.trim().slice(0, 24) : "";
  if (!ownerName || typeof data.targetAlertsEnabled !== "boolean") return null;
  if (data.theme !== "light" && data.theme !== "dark") return null;

  return {
    expenses: expenses as Expense[],
    targets,
    openingBalances: savedOpeningBalances,
    ownerName,
    targetAlertsEnabled: data.targetAlertsEnabled,
    theme: data.theme,
  };
}

function WeeklyTrendChart({ values, theme }: { values: number[]; theme: Theme }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const width = Math.max(canvas.clientWidth, 280);
      const height = 230;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const chart = { top: 29, right: 14, bottom: 33, left: 14 };
      const plotWidth = width - chart.left - chart.right;
      const plotHeight = height - chart.top - chart.bottom;
      const maximum = Math.max(...values, 1);
      const points = values.map((value, index) => ({
        x: chart.left + (plotWidth / Math.max(values.length - 1, 1)) * index,
        y: chart.top + plotHeight - (value / maximum) * plotHeight,
      }));

      context.strokeStyle = theme === "dark" ? "rgba(255,255,255,.08)" : "rgba(21,25,22,.09)";
      context.lineWidth = 1;
      context.setLineDash([3, 5]);
      for (let line = 0; line <= 4; line += 1) {
        const y = chart.top + (plotHeight / 4) * line;
        context.beginPath();
        context.moveTo(chart.left, y);
        context.lineTo(width - chart.right, y);
        context.stroke();
      }
      points.forEach((point) => {
        context.beginPath();
        context.moveTo(point.x, chart.top);
        context.lineTo(point.x, height - chart.bottom);
        context.stroke();
      });
      context.setLineDash([]);

      const tracePath = () => {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index += 1) {
          const previous = points[index - 1];
          const point = points[index];
          const middle = (previous.x + point.x) / 2;
          context.bezierCurveTo(middle, previous.y, middle, point.y, point.x, point.y);
        }
      };

      tracePath();
      context.lineTo(points.at(-1)!.x, height - chart.bottom);
      context.lineTo(points[0].x, height - chart.bottom);
      context.closePath();
      const area = context.createLinearGradient(0, chart.top, 0, height - chart.bottom);
      area.addColorStop(0, "rgba(212,244,118,.42)");
      area.addColorStop(.45, "rgba(89,201,145,.2)");
      area.addColorStop(1, "rgba(40,118,81,0)");
      context.fillStyle = area;
      context.fill();

      tracePath();
      const line = context.createLinearGradient(chart.left, 0, width - chart.right, 0);
      line.addColorStop(0, "#3fbf7f");
      line.addColorStop(.52, "#72dda5");
      line.addColorStop(1, "#d4f476");
      context.strokeStyle = line;
      context.lineWidth = 3;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.shadowColor = "rgba(89,201,145,.3)";
      context.shadowBlur = 10;
      context.stroke();
      context.shadowBlur = 0;

      const textColor = theme === "dark" ? "#929b94" : "#69716b";
      context.fillStyle = textColor;
      context.font = "700 9px system-ui, sans-serif";
      context.textAlign = "center";
      points.forEach((point, index) => {
        context.beginPath();
        context.fillStyle = index === points.length - 1 ? "#d4f476" : "#59c991";
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = textColor;
        context.fillText(`W${index + 1}`, point.x, height - 10);
        if (values[index] > 0) {
          context.fillText(money.format(values[index]), point.x, Math.max(point.y - 11, 11));
        }
      });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [theme, values]);

  return (
    <canvas
      className="weekly-line-chart"
      ref={canvasRef}
      role="img"
      aria-label={`Weekly spending: ${values.map((value, index) => `week ${index + 1} ${money.format(value)}`).join(", ")}`}
    />
  );
}

export default function PocketDashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("Food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState("");
  const [balanceDraft, setBalanceDraft] = useState("");
  const [planError, setPlanError] = useState("");
  const [targetAlertsEnabled, setTargetAlertsEnabled] = useState(false);
  const [targetAlertDraft, setTargetAlertDraft] = useState(false);
  const [ownerName, setOwnerName] = useState("Ratchet");
  const [nameDraft, setNameDraft] = useState("Ratchet");
  const [editingName, setEditingName] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("All");
  const [activeView, setActiveView] = useState<AppView>("home");
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState("");
  const backupFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setExpenses(loadSavedExpenses());
      const savedTargets = loadSavedTargets();
      const savedOpeningBalances = loadSavedOpeningBalances();
      if (localStorage.getItem(monthlyPlanMigrationKey) === "true") {
        setTargets(savedTargets);
        setOpeningBalances(savedOpeningBalances);
      } else {
        const migratedOpeningBalances = { ...savedTargets, ...savedOpeningBalances };
        setTargets({});
        setOpeningBalances(migratedOpeningBalances);
        localStorage.setItem(targetStorageKey, JSON.stringify({}));
        localStorage.setItem(openingBalanceStorageKey, JSON.stringify(migratedOpeningBalances));
        localStorage.setItem(monthlyPlanMigrationKey, "true");
      }
      setTargetAlertsEnabled(localStorage.getItem(targetAlertsStorageKey) === "true");
      const savedOwnerName = localStorage.getItem(ownerNameStorageKey)?.trim();
      if (savedOwnerName) {
        setOwnerName(savedOwnerName);
        setNameDraft(savedOwnerName);
      }
      const savedTheme = localStorage.getItem("pocket-theme") as Theme | null;
      setTheme(savedTheme ?? "dark");
      setLastBackupAt(localStorage.getItem(lastBackupStorageKey) ?? "");
    } catch {
      setTheme("dark");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pocket-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(expenseStorageKey, JSON.stringify(expenses));
  }, [expenses, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(targetStorageKey, JSON.stringify(targets));
  }, [hydrated, targets]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(openingBalanceStorageKey, JSON.stringify(openingBalances));
  }, [hydrated, openingBalances]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(targetAlertsStorageKey, String(targetAlertsEnabled));
  }, [hydrated, targetAlertsEnabled]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(ownerNameStorageKey, ownerName);
  }, [hydrated, ownerName]);

  useEffect(() => {
    setLedgerFilter("All");
  }, [selectedMonth]);

  const monthExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.date.startsWith(selectedMonth))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [expenses, selectedMonth],
  );

  const spent = monthExpenses.reduce((total, expense) => total + expense.amount, 0);
  const openingBalance = openingBalances[selectedMonth] ?? 0;
  const hasOpeningBalance = openingBalance > 0;
  const saved = hasOpeningBalance ? Math.max(openingBalance - spent, 0) : 0;
  const balanceDifference = hasOpeningBalance ? openingBalance - spent : 0;
  const balanceExceeded = hasOpeningBalance && spent > openingBalance;
  const target = targets[selectedMonth] ?? 0;
  const hasTarget = target > 0;
  const targetDifference = target - spent;
  const rawTargetProgress = hasTarget ? (spent / target) * 100 : 0;
  const targetProgress = Math.min(rawTargetProgress, 100);
  const targetReached = hasTarget && spent >= target;
  const spentShareOfBalance = hasOpeningBalance ? Math.min((spent / openingBalance) * 100, 100) : 0;
  const savingsGradient = hasOpeningBalance
    ? `conic-gradient(${balanceExceeded ? "var(--warning)" : "var(--accent)"} 0 ${spentShareOfBalance}%, var(--lime) ${spentShareOfBalance}% 100%)`
    : "conic-gradient(var(--track) 0 100%)";

  useEffect(() => {
    if (
      !hydrated ||
      !targetAlertsEnabled ||
      !targetReached ||
      selectedMonth !== monthKey() ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) return;

    const notifiedKey = `pocket-target-notified-${selectedMonth}-${target}`;
    if (localStorage.getItem(notifiedKey) === "true") return;
    localStorage.setItem(notifiedKey, "true");

    const notificationOptions = {
      body: `${money.format(spent)} spent against your ${money.format(target)} monthly target.`,
      icon: "/app-icon-192.png",
      badge: "/favicon-32.png",
      tag: notifiedKey,
    };

    navigator.serviceWorker.ready
      .then((registration) => registration.showNotification("Monthly expense target reached", notificationOptions))
      .catch(() => new Notification("Monthly expense target reached", notificationOptions));
  }, [hydrated, selectedMonth, spent, target, targetAlertsEnabled, targetReached]);

  const categoryTotals = categories
    .map((item) => {
      const matching = monthExpenses.filter((expense) => expense.category === item.name);
      return {
        ...item,
        count: matching.length,
        total: matching.reduce((sum, expense) => sum + expense.amount, 0),
      };
    })
    .sort((a, b) => b.total - a.total);

  const previousMonthSpent = expenses
    .filter((expense) => expense.date.startsWith(shiftMonth(selectedMonth, -1)))
    .reduce((total, expense) => total + expense.amount, 0);

  const monthChange = previousMonthSpent > 0
    ? ((spent - previousMonthSpent) / previousMonthSpent) * 100
    : null;

  const pieGradient = (() => {
    if (spent <= 0) return "conic-gradient(var(--track) 0 100%)";
    let cursor = 0;
    const slices = categoryTotals
      .filter((item) => item.total > 0)
      .map((item) => {
        const start = cursor;
        cursor += (item.total / spent) * 100;
        return `${item.color} ${start}% ${cursor}%`;
      });
    return `conic-gradient(${slices.join(", ")})`;
  })();

  const weeklyTotals = Array.from({ length: 5 }, (_, week) =>
    monthExpenses
      .filter((expense) => Math.floor((Number(expense.date.slice(-2)) - 1) / 7) === week)
      .reduce((total, expense) => total + expense.amount, 0),
  );
  const daysInSelectedMonth = new Date(
    Number(selectedMonth.slice(0, 4)),
    Number(selectedMonth.slice(5, 7)),
    0,
  ).getDate();
  const topCategory = categoryTotals[0]?.total > 0 ? categoryTotals[0] : null;
  const biggestExpense = monthExpenses.reduce<Expense | null>(
    (biggest, expense) => !biggest || expense.amount > biggest.amount ? expense : biggest,
    null,
  );

  const ledgerExpenses = useMemo(
    () => ledgerFilter === "All" ? monthExpenses : monthExpenses.filter((expense) => expense.category === ledgerFilter),
    [ledgerFilter, monthExpenses],
  );

  const ledgerTotal = ledgerExpenses.reduce((total, expense) => total + expense.amount, 0);

  const expenseGroups = useMemo(() => {
    const groups: { date: string; total: number; expenses: Expense[] }[] = [];
    for (const expense of ledgerExpenses) {
      const current = groups.at(-1);
      if (!current || current.date !== expense.date) {
        groups.push({ date: expense.date, total: expense.amount, expenses: [expense] });
      } else {
        current.expenses.push(expense);
        current.total += expense.amount;
      }
    }
    return groups;
  }, [ledgerExpenses]);

  function addExpense(event: FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) return;

    const expenseDate = date || today();
    setExpenses((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        amount: parsedAmount,
        category,
        note: note.trim(),
        date: expenseDate,
      },
    ]);
    setSelectedMonth(expenseDate.slice(0, 7));
    setAmount("");
    setNote("");
  }

  async function saveTarget(event: FormEvent) {
    event.preventDefault();
    const parsedBalance = Number(balanceDraft);
    const parsedTarget = Number(targetDraft);
    if (!parsedBalance || parsedBalance <= 0 || !parsedTarget || parsedTarget <= 0) {
      setPlanError("Enter both your starting balance and spending target.");
      return;
    }
    if (parsedTarget > parsedBalance) {
      setPlanError("Your spending target cannot be higher than your starting balance.");
      return;
    }
    setOpeningBalances((current) => ({ ...current, [selectedMonth]: parsedBalance }));
    setTargets((current) => ({ ...current, [selectedMonth]: parsedTarget }));

    let alertsAllowed = targetAlertDraft;
    if (alertsAllowed) {
      if (!("Notification" in window)) {
        alertsAllowed = false;
      } else {
        const permission = Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
        alertsAllowed = permission === "granted";
      }
    }
    setTargetAlertsEnabled(alertsAllowed);
    setEditingTarget(false);
  }

  function openTarget() {
    setBalanceDraft(hasOpeningBalance ? String(openingBalance) : "");
    setTargetDraft(hasTarget ? String(target) : "");
    setTargetAlertDraft(targetAlertsEnabled);
    setPlanError("");
    setEditingTarget(true);
  }

  function openNameEditor() {
    setNameDraft(ownerName);
    setEditingName(true);
  }

  function saveName(event: FormEvent) {
    event.preventDefault();
    const nextName = nameDraft.trim().slice(0, 24);
    if (!nextName) return;
    setOwnerName(nextName);
    setNameDraft(nextName);
    setEditingName(false);
  }

  function openBackup() {
    setBackupMessage("");
    setBackupError(false);
    setBackupOpen(true);
  }

  function exportBackup() {
    if (!hydrated) return;
    const exportedAt = new Date().toISOString();
    const backup: PocketBackup = {
      app: "Pocket",
      version: 1,
      exportedAt,
      data: {
        expenses,
        targets,
        openingBalances,
        ownerName,
        targetAlertsEnabled,
        theme: activeTheme,
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pocket-backup-${today()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    localStorage.setItem(lastBackupStorageKey, exportedAt);
    setLastBackupAt(exportedAt);
    setBackupError(false);
    setBackupMessage(`Backup created with ${expenses.length} ${expenses.length === 1 ? "entry" : "entries"}.`);
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setBackupError(true);
      setBackupMessage("This backup is too large. Choose a Pocket backup smaller than 5 MB.");
      return;
    }

    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      if (!parsed) throw new Error("Invalid backup");
      const confirmed = window.confirm(
        `Restore ${parsed.expenses.length} ${parsed.expenses.length === 1 ? "entry" : "entries"}? This will replace the Pocket data currently on this device.`,
      );
      if (!confirmed) return;

      setExpenses(parsed.expenses);
      setTargets(parsed.targets);
      setOpeningBalances(parsed.openingBalances ?? {});
      setOwnerName(parsed.ownerName);
      setNameDraft(parsed.ownerName);
      setTargetAlertsEnabled(parsed.targetAlertsEnabled);
      setTheme(parsed.theme);
      setSelectedMonth(monthKey());
      setLedgerFilter("All");
      setBackupError(false);
      setBackupMessage(`Restore complete. ${parsed.expenses.length} ${parsed.expenses.length === 1 ? "entry" : "entries"} are ready.`);
    } catch {
      setBackupError(true);
      setBackupMessage("That file is not a valid Pocket backup. No data was changed.");
    }
  }

  function removeExpense(id: string) {
    setExpenses((current) => current.filter((expense) => expense.id !== id));
  }

  function selectCategory(filter: LedgerFilter) {
    setLedgerFilter(filter);
    setActiveView("transactions");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeView(view: AppView) {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const activeTheme = theme ?? "dark";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">P</span>
          <div>
            <p className="eyebrow">Pocket</p>
            <h1>{activeView === "home" ? `${ownerName}'s expenses` : activeView === "transactions" ? `${ownerName}'s transactions` : `${ownerName}'s report`}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={openBackup} aria-label="Backup and restore Pocket data" title="Backup">
            <span aria-hidden="true">{"\u21e9"}</span>
          </button>
          <button className="profile-button" type="button" onClick={openNameEditor} aria-label="Edit your name">
            <span aria-hidden="true">{ownerName.slice(0, 1).toUpperCase()}</span>
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(activeTheme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${activeTheme === "dark" ? "light" : "dark"} mode`}
          >
            <span aria-hidden="true">{activeTheme === "dark" ? "☀" : "☾"}</span>
          </button>
        </div>
      </header>

      <section className="month-nav" aria-label="Choose month">
        <button type="button" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))} aria-label="Previous month">‹</button>
        <strong>{monthLabel(selectedMonth)}</strong>
        <button type="button" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))} aria-label="Next month">›</button>
      </section>

      {activeView === "home" && (
        <>
          <section className={targetReached ? "target-card target-card-reached" : "target-card"} aria-labelledby="target-card-title">
            <div className="target-topline">
              <div>
                <p className="eyebrow target-eyebrow">Monthly money plan</p>
                <span id="target-card-title">Total available at month start</span>
              </div>
              <button className="target-edit" type="button" onClick={openTarget}>Set plan</button>
            </div>
            <strong className="spent-total">{hasOpeningBalance ? money.format(openingBalance) : "Not set"}</strong>
            <div className="target-metrics target-metrics-three">
              <span><small>Total spent</small><strong>{money.format(spent)}</strong></span>
              <span><small>Spend target</small><strong>{hasTarget ? money.format(target) : "Not set"}</strong></span>
              <span><small>{balanceExceeded ? "Over balance" : "Saved"}</small><strong>{hasOpeningBalance ? money.format(Math.abs(balanceDifference)) : "Not set"}</strong></span>
            </div>
            <div className="target-track" role="progressbar" aria-label="Monthly target used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(targetProgress)}>
              <span style={{ width: `${targetProgress}%` }} />
            </div>
            <div className="target-caption">
              <span>{hasTarget ? `${Math.round(rawTargetProgress)}% of spending target used` : "Set your balance and spending target"}</span>
              <span>{targetAlertsEnabled ? "Alerts on" : "Alerts off"}</span>
            </div>
          </section>

          {targetReached && (
            <aside className="target-alert" role="status">
              <span className="target-alert-icon" aria-hidden="true">!</span>
              <div>
                <strong>Monthly target reached</strong>
                <p>{targetDifference < 0 ? `You are ${money.format(Math.abs(targetDifference))} over your target.` : "You have reached your monthly expense target."}</p>
              </div>
              <button type="button" onClick={openTarget}>Adjust</button>
            </aside>
          )}

          <section className="panel add-expense-panel" aria-labelledby="add-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Quick entry</p>
                <h2 id="add-title">Add expense</h2>
              </div>
              <span>takes 5 seconds</span>
            </div>
            <form onSubmit={addExpense}>
              <div className="amount-wrap">
                <span>₹</span>
                <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" step="1" inputMode="decimal" placeholder="0" aria-label="Expense amount" required />
              </div>

              <div className="category-grid" role="radiogroup" aria-label="Expense category">
                {categories.map((item) => (
                  <button key={item.name} type="button" role="radio" aria-checked={category === item.name} className={category === item.name ? "category-chip selected" : "category-chip"} onClick={() => setCategory(item.name)}>
                    <span aria-hidden="true">{item.icon}</span>{item.name}
                  </button>
                ))}
              </div>

              <div className="details-row">
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note (optional)" aria-label="Expense note" />
                <input value={date} onChange={(event) => setDate(event.target.value)} type="date" aria-label="Expense date" required />
              </div>
              <button className="primary-button" type="submit">Add expense</button>
            </form>
          </section>

          <section className="panel category-spend" aria-labelledby="category-spend-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Tap to explore</p>
                <h2 id="category-spend-title">{ownerName}&apos;s monthly expenses</h2>
              </div>
              <span>{monthExpenses.length} {monthExpenses.length === 1 ? "entry" : "entries"}</span>
            </div>

            <div className="category-overview-grid">
              {categoryTotals.map((item) => (
                <button className="category-tile" key={item.name} type="button" onClick={() => selectCategory(item.name)} aria-label={`View ${item.name} transactions`}>
                  <span className="category-tile-top">
                    <span className="category-icon" style={{ background: `${item.color}22`, color: item.color }} aria-hidden="true">{item.icon}</span>
                    <span className="row-chevron" aria-hidden="true">›</span>
                  </span>
                  <strong>{item.name}</strong>
                  <span className="category-tile-value">{money.format(item.total)}</span>
                  <span className="category-tile-meta">{item.count} {item.count === 1 ? "entry" : "entries"} · {spent > 0 ? Math.round((item.total / spent) * 100) : 0}%</span>
                  <span className="category-progress"><span style={{ width: `${spent > 0 ? (item.total / spent) * 100 : 0}%`, background: item.color }} /></span>
                </button>
              ))}
            </div>
          </section>

        </>
      )}

      {activeView === "transactions" && (
        <section className="panel transactions-view" id="monthly-expenses" aria-labelledby="all-expenses-title">
          <div className="section-heading expense-heading">
            <div>
              <p className="eyebrow">Complete monthly ledger</p>
              <h2 id="all-expenses-title">{ownerName}&apos;s {ledgerFilter === "All" ? "expense transactions" : `${ledgerFilter} expenses`}</h2>
            </div>
            <div className="ledger-totals">
              <span>{ledgerExpenses.length} {ledgerExpenses.length === 1 ? "entry" : "entries"}</span>
              <strong>{money.format(ledgerTotal)}</strong>
            </div>
          </div>

          <div className="expense-filters" aria-label="Filter monthly expenses">
            <button type="button" className={ledgerFilter === "All" ? "active" : ""} onClick={() => setLedgerFilter("All")}>All</button>
            {categories.map((item) => (
              <button key={item.name} type="button" className={ledgerFilter === item.name ? "active" : ""} onClick={() => setLedgerFilter(item.name)}>
                {item.icon} {item.name}
              </button>
            ))}
          </div>

          {expenseGroups.length ? (
            <div className="expense-groups">
              {expenseGroups.map((group) => (
                <div className="expense-group" key={group.date}>
                  <div className="expense-date-heading">
                    <strong>{groupDateLabel(group.date)}</strong>
                    <span>{money.format(group.total)}</span>
                  </div>
                  <div className="expense-list">
                    {group.expenses.map((expense) => {
                      const item = categories.find((candidate) => candidate.name === expense.category)!;
                      return (
                        <article className="expense-row" key={expense.id}>
                          <span className="expense-icon" style={{ background: `${item.color}22` }}>{item.icon}</span>
                          <div className="expense-copy">
                            <strong>{expense.note || expense.category}</strong>
                            <span>{expenseDateLabel(expense.date)} · {expense.category}</span>
                          </div>
                          <strong className="expense-amount">−{money.format(expense.amount)}</strong>
                          <button className="delete-button" type="button" onClick={() => removeExpense(expense.id)} aria-label={`Delete ${expense.note || expense.category} expense`}>×</button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state"><span aria-hidden="true">◎</span><strong>No expenses here</strong><p>Add an expense or choose another category.</p></div>
          )}
        </section>
      )}

      {activeView === "reports" && (
        <section className="reports-view" aria-labelledby="reports-title">
          <article className="report-summary">
            <div>
              <p className="eyebrow report-eyebrow">Monthly analysis</p>
              <h2 id="reports-title">{ownerName}&apos;s report</h2>
            </div>
            <strong>{money.format(spent)}</strong>
            <div className="report-plan-metrics">
              <span><small>Starting balance</small><strong>{hasOpeningBalance ? money.format(openingBalance) : "Not set"}</strong></span>
              <span><small>{balanceExceeded ? "Over balance" : "Saved this month"}</small><strong>{hasOpeningBalance ? money.format(Math.abs(balanceDifference)) : "Not set"}</strong></span>
            </div>
            <p className={monthChange !== null && monthChange > 0 ? "report-delta report-delta-up" : "report-delta"}>
              {monthChange === null
                ? "No spending recorded for the previous month"
                : monthChange === 0
                  ? "Same spending as last month"
                  : `${Math.abs(Math.round(monthChange))}% ${monthChange > 0 ? "higher" : "lower"} than last month`}
            </p>
          </article>

          <article className="panel chart-card" aria-labelledby="savings-chart-title">
            <div className="section-heading">
              <div><p className="eyebrow">Monthly balance</p><h2 id="savings-chart-title">Spent &amp; saved</h2></div>
              <span>{monthLabel(selectedMonth)}</span>
            </div>
            {hasOpeningBalance ? (
              <div className="pie-chart-layout">
                <div className="donut-chart savings-donut" style={{ background: savingsGradient }} role="img" aria-label={`${money.format(spent)} spent and ${money.format(saved)} saved this month`}>
                  <div><strong>{money.format(saved)}</strong><span>Saved</span></div>
                </div>
                <div className="chart-legend savings-legend">
                  <div><span className="spent-dot" /><strong>Spent</strong><small>{money.format(spent)}</small></div>
                  <div><span className="saved-dot" /><strong>Saved</strong><small>{money.format(saved)}</small></div>
                  {balanceExceeded && <p className="balance-warning">Spending is {money.format(Math.abs(balanceDifference))} above the starting balance.</p>}
                  {!balanceExceeded && <p>Saved is calculated automatically from your starting balance and expenses.</p>}
                </div>
              </div>
            ) : (
              <button className="report-empty-action" type="button" onClick={openTarget}>Set a starting balance to see monthly savings</button>
            )}
          </article>

          <article className="panel chart-card" aria-labelledby="category-chart-title">
            <div className="section-heading">
              <div><p className="eyebrow">Expense mix</p><h2 id="category-chart-title">By category</h2></div>
              <span>{monthExpenses.length} entries</span>
            </div>
            <div className="pie-chart-layout">
              <div className="donut-chart" style={{ background: pieGradient }} role="img" aria-label="Pie chart showing expense share by category">
                <div><strong>{money.format(spent)}</strong><span>Total</span></div>
              </div>
              <div className="chart-legend">
                {categoryTotals.filter((item) => item.total > 0).map((item) => (
                  <div key={item.name}>
                    <span style={{ background: item.color }} />
                    <strong>{item.name}</strong>
                    <small>{Math.round((item.total / spent) * 100)}%</small>
                  </div>
                ))}
                {!topCategory && <p>No expenses to chart yet.</p>}
              </div>
            </div>
          </article>

          <article className="panel chart-card" aria-labelledby="weekly-chart-title">
            <div className="section-heading">
              <div><p className="eyebrow">Spending rhythm</p><h2 id="weekly-chart-title">Weekly trend</h2></div>
              <span>{monthLabel(selectedMonth)}</span>
            </div>
            <WeeklyTrendChart values={weeklyTotals} theme={activeTheme} />
            <div className="line-chart-range" aria-hidden="true">
              <span>Days 1–7</span><span>8–14</span><span>15–21</span><span>22–28</span><span>29–{daysInSelectedMonth}</span>
            </div>
          </article>

          <div className="insight-grid" aria-label="Monthly insights">
            <article><span>Top category</span><strong>{topCategory?.name ?? "—"}</strong><small>{topCategory ? money.format(topCategory.total) : "No data"}</small></article>
            <article><span>Biggest expense</span><strong>{biggestExpense?.note || biggestExpense?.category || "—"}</strong><small>{biggestExpense ? money.format(biggestExpense.amount) : "No data"}</small></article>
            <article><span>Daily average</span><strong>{money.format(spent / daysInSelectedMonth)}</strong><small>Across {daysInSelectedMonth} days</small></article>
          </div>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Main app navigation">
        <button type="button" className={activeView === "home" ? "active" : ""} onClick={() => changeView("home")} aria-current={activeView === "home" ? "page" : undefined}><span aria-hidden="true">⌂</span><small>Home</small></button>
        <button type="button" className={activeView === "transactions" ? "active" : ""} onClick={() => changeView("transactions")} aria-current={activeView === "transactions" ? "page" : undefined}><span aria-hidden="true">≡</span><small>Transactions</small></button>
        <button type="button" className={activeView === "reports" ? "active" : ""} onClick={() => changeView("reports")} aria-current={activeView === "reports" ? "page" : undefined}><span aria-hidden="true">▥</span><small>Reports</small></button>
      </nav>

      {editingName && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingName(false)}>
          <form className="target-modal name-modal" onSubmit={saveName} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="name-title">
            <button className="modal-close" type="button" onClick={() => setEditingName(false)} aria-label="Close">×</button>
            <p className="eyebrow">Personalise Pocket</p>
            <h2 id="name-title">Add your name</h2>
            <p className="modal-description">No login is created. Your name is only used for headings on this device.</p>
            <div className="name-input"><input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} type="text" maxLength={24} autoComplete="name" placeholder="Your name" required /></div>
            <button className="primary-button" type="submit">Save name</button>
          </form>
        </div>
      )}

      {backupOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setBackupOpen(false)}>
          <section className="target-modal backup-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="backup-title">
            <button className="modal-close" type="button" onClick={() => setBackupOpen(false)} aria-label="Close">{"\u00d7"}</button>
            <p className="eyebrow">Your Pocket data</p>
            <h2 id="backup-title">Backup &amp; restore</h2>
            <p className="modal-description">Save every expense, monthly money plan, and preference in one file. The file stays on your device and is never uploaded.</p>

            <div className="backup-summary" aria-label="Backup contents">
              <div><span>Entries</span><strong>{expenses.length}</strong></div>
              <div><span>Monthly plans</span><strong>{new Set([...Object.keys(openingBalances), ...Object.keys(targets)]).size}</strong></div>
              <div><span>Last backup</span><strong>{lastBackupAt ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(lastBackupAt)) : "Not yet"}</strong></div>
            </div>

            <button className="primary-button backup-primary" type="button" onClick={exportBackup}>Download backup</button>
            <button className="secondary-button" type="button" onClick={() => backupFileRef.current?.click()}>Restore from backup</button>
            <input className="backup-file-input" ref={backupFileRef} type="file" accept="application/json,.json" onChange={restoreBackup} tabIndex={-1} aria-hidden="true" />
            <p className={backupError ? "backup-status backup-status-error" : "backup-status"} role="status" aria-live="polite">
              {backupMessage || "Keep this file somewhere safe, such as Google Drive or your computer."}
            </p>
          </section>
        </div>
      )}

      {editingTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingTarget(false)}>
          <form className="target-modal" onSubmit={saveTarget} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="target-title">
            <button className="modal-close" type="button" onClick={() => setEditingTarget(false)} aria-label="Close">×</button>
            <p className="eyebrow">{monthLabel(selectedMonth)}</p>
            <h2 id="target-title">Set monthly money plan</h2>
            <p className="modal-description">Add the money available at the start of this month, then choose how much of it you plan to spend.</p>
            <label className="plan-field">
              <span>Total available at month start</span>
              <div className="target-input"><span>₹</span><input autoFocus value={balanceDraft} onChange={(event) => { setBalanceDraft(event.target.value); setPlanError(""); }} type="number" min="1" inputMode="decimal" required /></div>
            </label>
            <label className="plan-field">
              <span>Spending target for this month</span>
              <div className="target-input"><span>₹</span><input value={targetDraft} onChange={(event) => { setTargetDraft(event.target.value); setPlanError(""); }} type="number" min="1" max={balanceDraft || undefined} inputMode="decimal" required /></div>
            </label>
            {planError && <p className="plan-error" role="alert">{planError}</p>}
            <label className="notification-toggle">
              <span><strong>Phone notification</strong><small>Notify me when the target is reached</small></span>
              <input type="checkbox" checked={targetAlertDraft} onChange={(event) => setTargetAlertDraft(event.target.checked)} />
            </label>
            <button className="primary-button" type="submit">Save monthly plan</button>
          </form>
        </div>
      )}
    </main>
  );
}
