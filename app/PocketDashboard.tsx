"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

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

type Income = {
  id: string;
  amount: number;
  source: string;
  date: string;
};

type EntryType = "expense" | "income";

type Theme = "light" | "dark";
type AppView = "home" | "transactions" | "reports" | "settings";

type PocketBackupPlugin = {
  saveBackup(options: { fileName: string; data: string }): Promise<{ saved: boolean }>;
};

const NativeBackup = registerPlugin<PocketBackupPlugin>("PocketBackup");

type PocketBackup = {
  app: "Pocket";
  version: 1 | 2 | 3 | 4;
  exportedAt: string;
  data: {
    expenses: Expense[];
    incomes?: Income[];
    targets: Record<string, number>;
    openingBalances?: Record<string, number>;
    savingsTargets?: Record<string, number>;
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
const incomeStorageKey = "pocket-incomes-v1";
const targetStorageKey = "pocket-budgets-v3";
const openingBalanceStorageKey = "pocket-opening-balances-v1";
const savingsTargetStorageKey = "pocket-savings-targets-v1";
const monthlyPlanMigrationKey = "pocket-monthly-plan-v1-migrated";
const targetAlertsStorageKey = "pocket-target-alerts";
const ownerNameStorageKey = "pocket-owner-name";
const ownerNameBrandMigrationKey = "pocket-owner-name-brand-v1";
const lastBackupStorageKey = "pocket-last-backup";
const defaultOwnerName = "Pocket";
const legacyDefaultOwnerNames = new Set(["rachit", "ratchet"]);

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

function parseIncome(value: unknown): Income | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Income>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.amount !== "number" ||
    !Number.isFinite(candidate.amount) ||
    candidate.amount <= 0 ||
    typeof candidate.source !== "string" ||
    typeof candidate.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)
  ) return null;

  return {
    id: candidate.id,
    amount: candidate.amount,
    source: candidate.source,
    date: candidate.date,
  };
}

function loadSavedIncomes() {
  try {
    const stored = localStorage.getItem(incomeStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseIncome).filter((income): income is Income => Boolean(income));
  } catch {
    return [];
  }
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

function loadSavedSavingsTargets() {
  const saved: Record<string, number> = {};
  try {
    const stored = localStorage.getItem(savingsTargetStorageKey);
    if (!stored) return saved;
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    for (const [month, value] of Object.entries(parsed)) {
      if (/^\d{4}-\d{2}$/.test(month) && typeof value === "number" && Number.isFinite(value) && value > 0) {
        saved[month] = value;
      }
    }
  } catch {
    // Keep the app usable if one saved savings goal is damaged.
  }
  return saved;
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
  if (
    backup.app !== "Pocket" ||
    (backup.version !== 1 && backup.version !== 2 && backup.version !== 3 && backup.version !== 4) ||
    !backup.data ||
    typeof backup.data !== "object"
  ) {
    return null;
  }

  const data = backup.data as Partial<PocketBackup["data"]>;
  if (!Array.isArray(data.expenses)) return null;
  const expenses = data.expenses.map(parseExpense);
  if (expenses.some((expense) => !expense)) return null;
  const incomeValues = data.incomes ?? [];
  if (!Array.isArray(incomeValues)) return null;
  const incomes = incomeValues.map(parseIncome);
  if (incomes.some((income) => !income)) return null;
  const savedTargets = parseMonthlyAmounts(data.targets);
  if (!savedTargets) return null;
  const hasOpeningBalances = data.openingBalances !== undefined;
  const savedOpeningBalances = hasOpeningBalances ? parseMonthlyAmounts(data.openingBalances) : savedTargets;
  if (!savedOpeningBalances) return null;
  const targets = hasOpeningBalances ? savedTargets : {};
  const savedSavingsTargets = data.savingsTargets === undefined ? {} : parseMonthlyAmounts(data.savingsTargets);
  if (!savedSavingsTargets) return null;

  const savedOwnerName = typeof data.ownerName === "string" ? data.ownerName.trim().slice(0, 24) : "";
  if (!savedOwnerName || typeof data.targetAlertsEnabled !== "boolean") return null;
  const ownerName = backup.version === 1 && legacyDefaultOwnerNames.has(savedOwnerName.toLowerCase())
    ? defaultOwnerName
    : savedOwnerName;
  if (data.theme !== "light" && data.theme !== "dark") return null;

  return {
    expenses: expenses as Expense[],
    incomes: incomes as Income[],
    targets,
    openingBalances: savedOpeningBalances,
    savingsTargets: savedSavingsTargets,
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

      context.strokeStyle = theme === "dark" ? "rgba(255,255,255,.08)" : "rgba(23,27,47,.09)";
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
      area.addColorStop(0, "rgba(98,217,255,.42)");
      area.addColorStop(.45, "rgba(124,140,255,.2)");
      area.addColorStop(1, "rgba(86,105,216,0)");
      context.fillStyle = area;
      context.fill();

      tracePath();
      const line = context.createLinearGradient(chart.left, 0, width - chart.right, 0);
      line.addColorStop(0, "#5669d8");
      line.addColorStop(.52, "#7c8cff");
      line.addColorStop(1, "#62d9ff");
      context.strokeStyle = line;
      context.lineWidth = 3;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.shadowColor = "rgba(124,140,255,.32)";
      context.shadowBlur = 10;
      context.stroke();
      context.shadowBlur = 0;

      const textColor = theme === "dark" ? "#9fa7c2" : "#68708d";
      context.fillStyle = textColor;
      context.font = "700 9px system-ui, sans-serif";
      context.textAlign = "center";
      points.forEach((point, index) => {
        context.beginPath();
        context.fillStyle = index === points.length - 1 ? "#62d9ff" : "#7c8cff";
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
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  const [savingsTargets, setSavingsTargets] = useState<Record<string, number>>({});
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [amount, setAmount] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("expense");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState<Category>("Food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState("");
  const [balanceDraft, setBalanceDraft] = useState("");
  const [savingsTargetDraft, setSavingsTargetDraft] = useState("");
  const [planError, setPlanError] = useState("");
  const [targetAlertsEnabled, setTargetAlertsEnabled] = useState(false);
  const [targetAlertDraft, setTargetAlertDraft] = useState(false);
  const [ownerName, setOwnerName] = useState(defaultOwnerName);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("All");
  const [activeView, setActiveView] = useState<AppView>("home");
  const [addingExpense, setAddingExpense] = useState(false);
  const [entryAdded, setEntryAdded] = useState<EntryType | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState("");
  const backupFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      // Client-only local storage is intentionally hydrated after the first render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpenses(loadSavedExpenses());
      setIncomes(loadSavedIncomes());
      const savedTargets = loadSavedTargets();
      const savedOpeningBalances = loadSavedOpeningBalances();
      const savedSavingsTargets = loadSavedSavingsTargets();
      setSavingsTargets(savedSavingsTargets);
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
      const savedOwnerName = localStorage.getItem(ownerNameStorageKey)?.trim().slice(0, 24);
      const normalizedSavedOwnerName = savedOwnerName?.toLowerCase() ?? "";
      const shouldMigrateLegacyDefault =
        localStorage.getItem(ownerNameBrandMigrationKey) !== "true" &&
        legacyDefaultOwnerNames.has(normalizedSavedOwnerName);
      const nextOwnerName = savedOwnerName && !shouldMigrateLegacyDefault
        ? savedOwnerName
        : defaultOwnerName;
      setOwnerName(nextOwnerName);
      setNameDraft(nextOwnerName === defaultOwnerName ? "" : nextOwnerName);
      localStorage.setItem(ownerNameStorageKey, nextOwnerName);
      localStorage.setItem(ownerNameBrandMigrationKey, "true");
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
    if (hydrated) localStorage.setItem(incomeStorageKey, JSON.stringify(incomes));
  }, [hydrated, incomes]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(targetStorageKey, JSON.stringify(targets));
  }, [hydrated, targets]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(openingBalanceStorageKey, JSON.stringify(openingBalances));
  }, [hydrated, openingBalances]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(savingsTargetStorageKey, JSON.stringify(savingsTargets));
  }, [hydrated, savingsTargets]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(targetAlertsStorageKey, String(targetAlertsEnabled));
  }, [hydrated, targetAlertsEnabled]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(ownerNameStorageKey, ownerName);
  }, [hydrated, ownerName]);

  useEffect(() => {
    // Changing month always starts the ledger on its complete, unfiltered view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLedgerFilter("All");
  }, [selectedMonth]);

  const monthExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.date.startsWith(selectedMonth))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [expenses, selectedMonth],
  );

  const monthIncomes = useMemo(
    () =>
      incomes
        .filter((income) => income.date.startsWith(selectedMonth))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [incomes, selectedMonth],
  );

  const spent = monthExpenses.reduce((total, expense) => total + expense.amount, 0);
  const incomeReceived = monthIncomes.reduce((total, income) => total + income.amount, 0);
  const openingBalance = openingBalances[selectedMonth] ?? 0;
  const hasOpeningBalance = openingBalance > 0;
  const totalAvailable = openingBalance + incomeReceived;
  const hasAvailableBalance = totalAvailable > 0;
  const saved = hasAvailableBalance ? Math.max(totalAvailable - spent, 0) : 0;
  const balanceDifference = hasAvailableBalance ? totalAvailable - spent : 0;
  const balanceExceeded = hasAvailableBalance && spent > totalAvailable;
  const target = targets[selectedMonth] ?? 0;
  const hasTarget = target > 0;
  const targetDifference = target - spent;
  const rawTargetProgress = hasTarget ? (spent / target) * 100 : 0;
  const targetProgress = Math.min(rawTargetProgress, 100);
  const targetReached = hasTarget && spent >= target;
  const savingsTarget = savingsTargets[selectedMonth] ?? 0;
  const hasSavingsTarget = savingsTarget > 0;
  const savingsGoalDifference = hasSavingsTarget ? saved - savingsTarget : 0;
  const savingsGoalProtected = hasSavingsTarget && saved >= savingsTarget;
  const safeToSpend = hasAvailableBalance && hasSavingsTarget
    ? Math.max(totalAvailable - savingsTarget - spent, 0)
    : 0;
  const savingsProgress = hasSavingsTarget ? Math.min((saved / savingsTarget) * 100, 100) : 0;
  const isCompletedMonth = selectedMonth < monthKey();
  const completedSavingsGoal = hasAvailableBalance && hasSavingsTarget && saved >= savingsTarget;

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
  const recentMonthTotals = [1, 2, 3]
    .map((offset) => expenses
      .filter((expense) => expense.date.startsWith(shiftMonth(selectedMonth, -offset)))
      .reduce((total, expense) => total + expense.amount, 0))
    .filter((total) => total > 0);
  const recentMonthlyAverage = recentMonthTotals.length
    ? recentMonthTotals.reduce((total, value) => total + value, 0) / recentMonthTotals.length
    : 0;
  const elapsedDays = selectedMonth === monthKey()
    ? Math.min(new Date().getDate(), daysInSelectedMonth)
    : daysInSelectedMonth;
  const projectedCurrentSpend = spent > 0 && elapsedDays >= 3
    ? (spent / elapsedDays) * daysInSelectedMonth
    : 0;

  function recommendSavings(balanceValue: number, spendingTargetValue: number) {
    if (!Number.isFinite(balanceValue) || balanceValue <= 0) {
      return { amount: 0, reason: "Set your starting balance to get a recommendation." };
    }

    const validSpendingTarget = Number.isFinite(spendingTargetValue) && spendingTargetValue > 0 && spendingTargetValue <= balanceValue;
    const balancedStartingPoint = balanceValue * 0.2;
    const planBasedAmount = validSpendingTarget
      ? Math.max(balanceValue - spendingTargetValue, 0)
      : balancedStartingPoint;
    const spendingSignals = [recentMonthlyAverage, projectedCurrentSpend].filter((value) => value > 0);
    const expectedSpend = spendingSignals.length ? Math.max(...spendingSignals, spent) : 0;
    const activityBasedAmount = expectedSpend > 0 ? Math.max(balanceValue - expectedSpend, 0) : planBasedAmount;
    const conservativeAmount = Math.min(planBasedAmount, activityBasedAmount, balanceValue);
    const amount = Math.floor(conservativeAmount / 100) * 100;

    if (amount <= 0) {
      return { amount: 0, reason: "Your current spending pace does not leave a safe saving amount yet." };
    }
    if (validSpendingTarget && spendingSignals.length) {
      return { amount, reason: "Based on your spending target and recent spending pace." };
    }
    if (validSpendingTarget) {
      return { amount, reason: "Based on the amount left after your spending target." };
    }
    if (spendingSignals.length) {
      return { amount, reason: "A 20% starting point adjusted for your recent spending pace." };
    }
    return { amount, reason: "A balanced 20% starting point for this month." };
  }

  const savingsRecommendation = recommendSavings(totalAvailable, target);
  const draftSavingsRecommendation = recommendSavings(Number(balanceDraft), Number(targetDraft));
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

  function addEntry(event: FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) return;

    const entryDate = date || today();
    if (entryType === "income") {
      setIncomes((current) => [...current, {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        amount: parsedAmount,
        source: source.trim(),
        date: entryDate,
      }]);
    } else {
      setExpenses((current) => [...current, {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        amount: parsedAmount,
        category,
        note: note.trim(),
        date: entryDate,
      }]);
    }
    setSelectedMonth(entryDate.slice(0, 7));
    setAmount("");
    setNote("");
    setSource("");
    setAddingExpense(false);
    setEntryAdded(entryType);
    window.setTimeout(() => setEntryAdded(null), 2400);
  }

  async function saveTarget(event: FormEvent) {
    event.preventDefault();
    const parsedBalance = Number(balanceDraft);
    const parsedTarget = Number(targetDraft);
    const parsedSavingsTarget = Number(savingsTargetDraft || 0);
    if (
      !Number.isFinite(parsedBalance) ||
      parsedBalance <= 0 ||
      !Number.isFinite(parsedTarget) ||
      parsedTarget <= 0
    ) {
      setPlanError("Enter both your starting balance and spending target.");
      return;
    }
    if (!Number.isFinite(parsedSavingsTarget) || parsedSavingsTarget < 0) {
      setPlanError("Your savings goal cannot be negative.");
      return;
    }
    setOpeningBalances((current) => ({ ...current, [selectedMonth]: parsedBalance }));
    setTargets((current) => ({ ...current, [selectedMonth]: parsedTarget }));
    setSavingsTargets((current) => {
      const next = { ...current };
      if (parsedSavingsTarget > 0) next[selectedMonth] = parsedSavingsTarget;
      else delete next[selectedMonth];
      return next;
    });

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
    setSavingsTargetDraft(hasSavingsTarget ? String(savingsTarget) : "");
    setTargetAlertDraft(targetAlertsEnabled);
    setPlanError("");
    setEditingTarget(true);
  }

  function openRecommendedSavingsGoal() {
    if (!hasOpeningBalance || savingsRecommendation.amount <= 0) {
      openTarget();
      return;
    }
    setBalanceDraft(String(openingBalance));
    setTargetDraft(hasTarget ? String(target) : String(Math.max(openingBalance - savingsRecommendation.amount, 1)));
    setSavingsTargetDraft(String(savingsRecommendation.amount));
    setTargetAlertDraft(targetAlertsEnabled);
    setPlanError("");
    setEditingTarget(true);
  }

  function useDraftSavingsRecommendation() {
    if (draftSavingsRecommendation.amount <= 0) return;
    setSavingsTargetDraft(String(draftSavingsRecommendation.amount));
    if (!Number(targetDraft) && Number(balanceDraft) > draftSavingsRecommendation.amount) {
      setTargetDraft(String(Number(balanceDraft) - draftSavingsRecommendation.amount));
    }
    setPlanError("");
  }

  function openNameEditor() {
    setNameDraft(ownerName === defaultOwnerName ? "" : ownerName);
    setEditingName(true);
  }

  function saveName(event: FormEvent) {
    event.preventDefault();
    const nextName = nameDraft.trim().slice(0, 24) || defaultOwnerName;
    setOwnerName(nextName);
    setNameDraft(nextName);
    setEditingName(false);
  }

  function openBackup() {
    setBackupMessage("");
    setBackupError(false);
    setBackupOpen(true);
  }

  async function exportBackup() {
    if (!hydrated) return;
    const exportedAt = new Date().toISOString();
    const fileName = `pocket-backup-${today()}.json`;
    const backup: PocketBackup = {
      app: "Pocket",
      version: 4,
      exportedAt,
      data: {
        expenses,
        incomes,
        targets,
        openingBalances,
        savingsTargets,
        ownerName,
        targetAlertsEnabled,
        theme: activeTheme,
      },
    };
    const backupJson = JSON.stringify(backup, null, 2);

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await NativeBackup.saveBackup({ fileName, data: backupJson });
        if (!result.saved) {
          setBackupError(true);
          setBackupMessage("Backup was not saved. Choose a location and tap Save to create the file.");
          return;
        }
      } catch {
        setBackupError(true);
        setBackupMessage("Pocket could not save the backup. Please choose a different folder and try again.");
        return;
      }
    } else {
      const blob = new Blob([backupJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    localStorage.setItem(lastBackupStorageKey, exportedAt);
    setLastBackupAt(exportedAt);
    setBackupError(false);
    const entryCount = expenses.length + incomes.length;
    setBackupMessage(`Backup saved as ${fileName} with ${entryCount} ${entryCount === 1 ? "entry" : "entries"}.`);
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
      const entryCount = parsed.expenses.length + (parsed.incomes?.length ?? 0);
      const confirmed = window.confirm(
        `Restore ${entryCount} ${entryCount === 1 ? "entry" : "entries"}? This will replace the Pocket data currently on this device.`,
      );
      if (!confirmed) return;

      setExpenses(parsed.expenses);
      setIncomes(parsed.incomes ?? []);
      setTargets(parsed.targets);
      setOpeningBalances(parsed.openingBalances ?? {});
      setSavingsTargets(parsed.savingsTargets ?? {});
      setOwnerName(parsed.ownerName);
      setNameDraft(parsed.ownerName);
      setTargetAlertsEnabled(parsed.targetAlertsEnabled);
      setTheme(parsed.theme);
      setSelectedMonth(monthKey());
      setLedgerFilter("All");
      setBackupError(false);
      setBackupMessage(`Restore complete. ${entryCount} ${entryCount === 1 ? "entry is" : "entries are"} ready.`);
    } catch {
      setBackupError(true);
      setBackupMessage("That file is not a valid Pocket backup. No data was changed.");
    }
  }

  function removeExpense(id: string) {
    const expense = expenses.find((item) => item.id === id);
    if (!expense || !window.confirm(`Delete ${expense.note || expense.category} for ${money.format(expense.amount)}?`)) return;
    setExpenses((current) => current.filter((expense) => expense.id !== id));
  }

  function removeIncome(id: string) {
    const income = incomes.find((item) => item.id === id);
    if (!income || !window.confirm(`Delete ${income.source || "income"} for ${money.format(income.amount)}?`)) return;
    setIncomes((current) => current.filter((item) => item.id !== id));
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

  function openAddExpense() {
    setEntryType("expense");
    setAmount("");
    setNote("");
    setSource("");
    setDate(selectedMonth === monthKey() ? today() : `${selectedMonth}-01`);
    setAddingExpense(true);
  }

  const activeTheme = theme ?? "dark";
  const ownerHeading = ownerName.toLowerCase() === defaultOwnerName.toLowerCase()
    ? defaultOwnerName
    : `${ownerName}'s`;
  const activeTitle = activeView === "home"
    ? `${ownerHeading} expenses`
    : activeView === "transactions"
      ? `${ownerHeading} transactions`
      : activeView === "reports"
        ? `${ownerHeading} reports`
        : "Settings";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">P</span>
          <div>
            <p className="eyebrow">Pocket</p>
            <h1>{activeTitle}</h1>
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

      {activeView !== "settings" && <section className="month-nav" aria-label="Choose month">
        <button type="button" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))} aria-label="Previous month">‹</button>
        <strong>{monthLabel(selectedMonth)}</strong>
        <button type="button" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))} aria-label="Next month">›</button>
      </section>}

      {activeView === "home" && (
        <div className="home-view">
          <div className="home-primary">
          <section className={targetReached ? "target-card home-plan-card target-card-reached" : "target-card home-plan-card"} aria-labelledby="target-card-title">
            <div className="target-topline">
              <div>
                <p className="eyebrow target-eyebrow">Monthly overview</p>
                <span id="target-card-title">Available this month</span>
              </div>
              <button className="target-edit" type="button" onClick={openTarget}>{hasOpeningBalance ? "Edit plan" : "Set plan"}</button>
            </div>
            <div className="target-balance-layout">
              <div>
                <strong className="spent-total">{hasAvailableBalance ? money.format(totalAvailable) : "Not set"}</strong>
                <span className="target-balance-subtitle">{incomeReceived > 0 ? `${money.format(openingBalance)} start + ${money.format(incomeReceived)} income` : hasTarget ? `Spending target ${money.format(target)}` : "Set a spending target"}</span>
              </div>
              <div
                className="target-progress-ring"
                style={{ background: `conic-gradient(${targetReached ? "#ff9a7c" : "var(--lime)"} ${targetProgress}%, rgba(255,255,255,.16) 0)` }}
                role="progressbar"
                aria-label="Monthly target used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(targetProgress)}
              >
                <span>{hasTarget ? `${Math.round(rawTargetProgress)}%` : "—"}</span>
              </div>
            </div>
          </section>
          <div className="target-inline-metrics" aria-label="Monthly plan figures">
            <span><small>Total spent</small><strong>{money.format(spent)}</strong></span>
            <span><small>{balanceExceeded ? "Over balance" : "Balance"}</small><strong>{hasAvailableBalance ? money.format(Math.abs(balanceDifference)) : "Not set"}</strong></span>
            <span><small>{targetDifference < 0 ? "Over target" : "Target left"}</small><strong>{hasTarget ? money.format(Math.abs(targetDifference)) : "Not set"}</strong></span>
          </div>

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

            <section className={hasSavingsTarget && !savingsGoalProtected ? "savings-goal-card savings-goal-card-warning" : "savings-goal-card"} aria-labelledby="savings-goal-title">
              <div className="savings-goal-heading">
                <span className="savings-goal-icon" aria-hidden="true">S</span>
                <div>
                  <p className="eyebrow">{hasSavingsTarget ? "Savings goal" : "Pocket recommends"}</p>
                  <strong id="savings-goal-title">{hasSavingsTarget ? money.format(savingsTarget) : savingsRecommendation.amount > 0 ? money.format(savingsRecommendation.amount) : "No safe amount yet"}</strong>
                </div>
                {hasSavingsTarget && <button type="button" onClick={openTarget}>Edit</button>}
              </div>
              {hasSavingsTarget ? (
                <>
                  <div className="savings-goal-stats">
                    <span><small>Saved now</small><strong>{money.format(saved)}</strong></span>
                    <span><small>{savingsGoalProtected ? "Safe to spend" : "Goal shortfall"}</small><strong>{money.format(savingsGoalProtected ? safeToSpend : Math.abs(savingsGoalDifference))}</strong></span>
                  </div>
                  <div className="savings-goal-track" role="progressbar" aria-label="Current savings compared with savings goal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(savingsProgress)}>
                    <span style={{ width: `${savingsProgress}%` }} />
                  </div>
                  <p>{savingsGoalProtected ? "Your goal is protected at your current spending level." : "Reduce spending to bring this savings goal back on track."}</p>
                </>
              ) : (
                <>
                  <p>{savingsRecommendation.reason}</p>
                  <div className="savings-recommendation-actions">
                    {savingsRecommendation.amount > 0 && <button type="button" onClick={openRecommendedSavingsGoal}>Use recommendation</button>}
                    <button type="button" onClick={openTarget}>Set another goal</button>
                  </div>
                </>
              )}
            </section>

            <section className="quick-add-card" aria-labelledby="quick-add-title">
              <span className="quick-add-icon" aria-hidden="true">+</span>
              <div>
                <strong id="quick-add-title">Record money in or out</strong>
                <small>Add an expense or income in seconds</small>
              </div>
              <button type="button" onClick={openAddExpense}>Add entry</button>
            </section>
          </div>

          <section className="panel add-expense-panel legacy-add-panel" aria-labelledby="add-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Quick entry</p>
                <h2 id="add-title">Add expense</h2>
              </div>
              <span>takes 5 seconds</span>
            </div>
            <form onSubmit={addEntry}>
              <div className="entry-type-toggle" role="group" aria-label="Entry type">
                <button type="button" className={entryType === "expense" ? "active" : ""} onClick={() => setEntryType("expense")}>Expense</button>
                <button type="button" className={entryType === "income" ? "active income-active" : ""} onClick={() => setEntryType("income")}>Income</button>
              </div>
              <div className="amount-wrap">
                <span>₹</span>
                <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" step="1" inputMode="decimal" placeholder="0" aria-label="Expense amount" required />
              </div>

              {entryType === "expense" ? <div className="category-grid" role="radiogroup" aria-label="Expense category">
                {categories.map((item) => (
                  <button key={item.name} type="button" role="radio" aria-checked={category === item.name} className={category === item.name ? "category-chip selected" : "category-chip"} onClick={() => setCategory(item.name)}>
                    <span aria-hidden="true">{item.icon}</span>{item.name}
                  </button>
                ))}
              </div> : <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Income source (optional)" aria-label="Income source" />}

              <div className="details-row">
                {entryType === "expense" && <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note (optional)" aria-label="Expense note" />}
                <input value={date} onChange={(event) => setDate(event.target.value)} type="date" aria-label="Expense date" required />
              </div>
              <button className="primary-button" type="submit">Add {entryType}</button>
            </form>
          </section>

          <section className="panel category-spend" aria-labelledby="category-spend-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Tap to explore</p>
                <h2 id="category-spend-title">Category spend</h2>
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

        </div>
      )}

      {activeView === "transactions" && (
        <section className="panel transactions-view" id="monthly-expenses" aria-labelledby="all-expenses-title">
          <article className="transactions-overview-card" aria-label={`${monthLabel(selectedMonth)} spending overview`}>
            <div>
              <p className="eyebrow target-eyebrow">{monthLabel(selectedMonth)} outflow</p>
              <strong>{money.format(spent)}</strong>
              <span>{hasTarget ? (spent > target ? `${money.format(spent - target)} over your spending target` : `${money.format(target - spent)} remains in your spending target`) : "No spending target set"}</span>
            </div>
            <div className="transactions-overview-side">
              <div
                className="transactions-target-ring"
                style={{ background: `conic-gradient(var(--lime) ${targetProgress}%, rgba(255,255,255,.16) 0)` }}
                role="progressbar"
                aria-label="Monthly spending target used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(targetProgress)}
              >
                <span><strong>{hasTarget ? `${Math.round(rawTargetProgress)}%` : "—"}</strong><small>{hasTarget ? "used" : "no target"}</small></span>
              </div>
              <span className="transactions-entry-count">{monthExpenses.length + monthIncomes.length} {monthExpenses.length + monthIncomes.length === 1 ? "entry" : "entries"}</span>
            </div>
          </article>

          {monthIncomes.length > 0 && (
            <section className="income-ledger" aria-labelledby="income-ledger-title">
              <div className="section-heading income-heading">
                <div><p className="eyebrow">Money received</p><h2 id="income-ledger-title">Income</h2></div>
                <strong>+{money.format(incomeReceived)}</strong>
              </div>
              <div className="income-list">
                {monthIncomes.map((income) => (
                  <article className="expense-row income-row" key={income.id}>
                    <span className="expense-icon income-icon" aria-hidden="true">↗</span>
                    <div className="expense-copy">
                      <strong>{income.source || "Income"}</strong>
                      <span>{expenseDateLabel(income.date)} · Income</span>
                    </div>
                    <strong className="income-amount">+{money.format(income.amount)}</strong>
                    <button className="delete-button" type="button" onClick={() => removeIncome(income.id)} aria-label={`Delete ${income.source || "income"}`}>×</button>
                  </article>
                ))}
              </div>
            </section>
          )}
          <div className="section-heading expense-heading">
            <div>
              <p className="eyebrow">Complete monthly ledger</p>
              <h2 id="all-expenses-title">{ownerHeading} {ledgerFilter === "All" ? "expense transactions" : `${ledgerFilter} expenses`}</h2>
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
              {ledgerExpenses.length > 8 && <button className="back-to-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top</button>}
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
              <h2 id="reports-title">{ownerHeading} reports</h2>
            </div>
            <strong>{money.format(spent)}</strong>
            <div className="report-plan-metrics">
              <span><small>Starting balance</small><strong>{hasOpeningBalance ? money.format(openingBalance) : "Not set"}</strong></span>
              <span><small>Income received</small><strong>{money.format(incomeReceived)}</strong></span>
              <span><small>{balanceExceeded ? "Over balance" : "Balance now"}</small><strong>{hasAvailableBalance ? money.format(Math.abs(balanceDifference)) : "Not set"}</strong></span>
              <span><small>Savings goal</small><strong>{hasSavingsTarget ? money.format(savingsTarget) : "Not set"}</strong></span>
            </div>
            <p className={monthChange !== null && monthChange > 0 ? "report-delta report-delta-up" : "report-delta"}>
              {monthChange === null
                ? "No spending recorded for the previous month"
                : monthChange === 0
                  ? "Same spending as last month"
                  : `${Math.abs(Math.round(monthChange))}% ${monthChange > 0 ? "higher" : "lower"} than last month`}
            </p>
          </article>

          {isCompletedMonth && (
            <article className={`panel month-end-summary ${completedSavingsGoal ? "month-end-summary-success" : "month-end-summary-missed"}`} aria-labelledby="month-end-summary-title">
              <div className="month-end-summary-heading">
                <div>
                  <p className="eyebrow">Completed month</p>
                  <h2 id="month-end-summary-title">{monthLabel(selectedMonth)} summary</h2>
                </div>
                <span>{hasSavingsTarget ? (completedSavingsGoal ? "Goal achieved" : "Goal not achieved") : "No savings goal"}</span>
              </div>
              <div className="month-end-summary-grid">
                <span><small>Starting balance</small><strong>{hasOpeningBalance ? money.format(openingBalance) : "Not set"}</strong></span>
                <span><small>Income received</small><strong>{money.format(incomeReceived)}</strong></span>
                <span><small>Total spent</small><strong>{money.format(spent)}</strong></span>
                <span><small>Total saved</small><strong>{hasAvailableBalance ? money.format(saved) : "Not set"}</strong></span>
                <span><small>Savings target</small><strong>{hasSavingsTarget ? money.format(savingsTarget) : "Not set"}</strong></span>
              </div>
              <p>
                {hasSavingsTarget && hasAvailableBalance
                  ? completedSavingsGoal
                    ? `You saved ${money.format(saved - savingsTarget)} more than your goal.`
                    : `You finished ${money.format(savingsTarget - saved)} below your savings goal.`
                  : "Set a starting balance and savings goal to measure achievement for future months."}
              </p>
            </article>
          )}

          <article className="panel chart-card" aria-labelledby="savings-chart-title">
            <div className="section-heading">
              <div><p className="eyebrow">Monthly balance</p><h2 id="savings-chart-title">Spent &amp; saved</h2></div>
              <span>{monthLabel(selectedMonth)}</span>
            </div>
            {hasAvailableBalance ? (
              <div className="balance-circle-section">
                <div className="balance-circle-layout" role="img" aria-label={`${money.format(spent)} spent and ${money.format(saved)} currently saved this month`}>
                  <div
                    className="balance-circle"
                    style={{ background: `conic-gradient(#ff8b76 0 ${Math.min((spent / totalAvailable) * 100, 100)}%, var(--lime) 0 100%)` }}
                  >
                    <span><strong>{money.format(saved)}</strong><small>saved</small></span>
                  </div>
                  <div className="balance-circle-legend">
                    <div><span className="balance-circle-dot balance-circle-dot-spent" /><span><small>Spent</small><strong>{money.format(spent)}</strong></span></div>
                    <div><span className="balance-circle-dot balance-circle-dot-saved" /><span><small>Saved now</small><strong>{money.format(saved)}</strong></span></div>
                    <p>{balanceExceeded ? `${money.format(Math.abs(balanceDifference))} over your available money` : `${Math.round((saved / totalAvailable) * 100)}% of this month's available money remains`}</p>
                  </div>
                </div>
                {hasSavingsTarget && (
                  <div className={savingsGoalProtected ? "savings-report-status" : "savings-report-status savings-report-status-warning"}>
                    <span><small>Savings goal</small><strong>{money.format(savingsTarget)}</strong></span>
                    <span><small>{savingsGoalProtected ? "Safe to spend" : "Goal shortfall"}</small><strong>{money.format(savingsGoalProtected ? safeToSpend : Math.abs(savingsGoalDifference))}</strong></span>
                  </div>
                )}
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
            {topCategory ? (
              <div className="category-column-section">
                <div
                  className="category-column-chart"
                  style={{ gridTemplateColumns: `repeat(${categoryTotals.filter((item) => item.total > 0).length}, minmax(34px, 1fr))` }}
                  role="img"
                  aria-label="Expense share by category shown as vertical columns"
                >
                  {categoryTotals.filter((item) => item.total > 0).map((item) => (
                    <div className="category-column" key={item.name} aria-label={`${item.name}: ${money.format(item.total)}, ${Math.round((item.total / spent) * 100)}%`}>
                      <div><span style={{ height: `${Math.max((item.total / topCategory.total) * 100, 7)}%`, background: `linear-gradient(180deg, ${item.color}, ${item.color}b8)` }} /></div>
                      <small aria-hidden="true">{item.icon}</small>
                    </div>
                  ))}
                </div>
                <div className="category-column-legend">
                  {categoryTotals.filter((item) => item.total > 0).map((item) => (
                    <div key={item.name}>
                      <span><i style={{ background: item.color }} />{item.name}</span>
                      <strong>{money.format(item.total)} <small>&middot; {Math.round((item.total / spent) * 100)}%</small></strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="chart-empty"><span aria-hidden="true">{"\u25ce"}</span><p>No expenses to chart yet.</p></div>}
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

      {activeView === "settings" && (
        <section className="settings-view" aria-labelledby="settings-title">
          <article className="settings-profile-card">
            <span className="settings-avatar" aria-hidden="true">{ownerName.slice(0, 1).toUpperCase()}</span>
            <div>
              <p className="eyebrow">Pocket profile</p>
              <h2 id="settings-title">{ownerName === defaultOwnerName ? "Pocket Expense" : ownerName}</h2>
              <span>{ownerName === defaultOwnerName ? "Add your name for personalised headings" : "Your name is shown only on this device"}</span>
            </div>
            <button type="button" onClick={openNameEditor}>Edit</button>
          </article>

          <div className="settings-grid">
            <article className="panel settings-card">
              <div className="settings-card-heading">
                <span className="settings-card-icon" aria-hidden="true">{"\u2726"}</span>
                <div><p className="eyebrow">Appearance</p><h2>Make Pocket yours</h2></div>
              </div>
              <div className="theme-selector" role="group" aria-label="Choose app appearance">
                <button type="button" className={activeTheme === "light" ? "active" : ""} onClick={() => setTheme("light")}>Light</button>
                <button type="button" className={activeTheme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>Dark</button>
              </div>
            </article>

            <article className="panel settings-card">
              <div className="settings-card-heading">
                <span className="settings-card-icon" aria-hidden="true">{"\u25ce"}</span>
                <div><p className="eyebrow">Monthly plan</p><h2>{monthLabel(selectedMonth)}</h2></div>
              </div>
              <div className="settings-summary-row"><span>Starting balance</span><strong>{hasOpeningBalance ? money.format(openingBalance) : "Not set"}</strong></div>
              <div className="settings-summary-row"><span>Spending target</span><strong>{hasTarget ? money.format(target) : "Not set"}</strong></div>
              <div className="settings-summary-row"><span>Savings goal</span><strong>{hasSavingsTarget ? money.format(savingsTarget) : "Not set"}</strong></div>
              <button className="settings-action" type="button" onClick={openTarget}>Manage monthly plan <span aria-hidden="true">{"\u203a"}</span></button>
            </article>

            <article className="panel settings-card settings-card-wide">
              <div className="settings-card-heading">
                <span className="settings-card-icon" aria-hidden="true">{"\u21e9"}</span>
                <div><p className="eyebrow">Your data</p><h2>Backup &amp; restore</h2></div>
              </div>
              <div className="settings-data-summary">
                <div><span>Entries</span><strong>{expenses.length + incomes.length}</strong></div>
                <div><span>Monthly plans</span><strong>{new Set([...Object.keys(openingBalances), ...Object.keys(targets), ...Object.keys(savingsTargets)]).size}</strong></div>
                <div><span>Last backup</span><strong>{lastBackupAt ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(lastBackupAt)) : "Not yet"}</strong></div>
              </div>
              <button className="settings-action" type="button" onClick={openBackup}>Open backup tools <span aria-hidden="true">{"\u203a"}</span></button>
            </article>
          </div>

          <p className="settings-version">Pocket Expense &middot; Phase 1 professional interface</p>
        </section>
      )}

      <nav className="bottom-nav legacy-bottom-nav" aria-label="Legacy app navigation">
        <button type="button" className={activeView === "home" ? "active" : ""} onClick={() => changeView("home")} aria-current={activeView === "home" ? "page" : undefined}><span aria-hidden="true">⌂</span><small>Home</small></button>
        <button type="button" className={activeView === "transactions" ? "active" : ""} onClick={() => changeView("transactions")} aria-current={activeView === "transactions" ? "page" : undefined}><span aria-hidden="true">≡</span><small>Transactions</small></button>
        <button type="button" className={activeView === "reports" ? "active" : ""} onClick={() => changeView("reports")} aria-current={activeView === "reports" ? "page" : undefined}><span aria-hidden="true">▥</span><small>Reports</small></button>
      </nav>

      <nav className="bottom-nav professional-nav" aria-label="Main app navigation">
        <button type="button" className={activeView === "home" ? "active" : ""} onClick={() => changeView("home")} aria-current={activeView === "home" ? "page" : undefined}><span aria-hidden="true">{"\u2302"}</span><small>Home</small></button>
        <button type="button" className={activeView === "transactions" ? "active" : ""} onClick={() => changeView("transactions")} aria-current={activeView === "transactions" ? "page" : undefined}><span aria-hidden="true">{"\u2261"}</span><small>Transactions</small></button>
        <button type="button" className="nav-add-button" onClick={openAddExpense} aria-label="Add a new entry"><span aria-hidden="true">+</span><small>Add</small></button>
        <button type="button" className={activeView === "reports" ? "active" : ""} onClick={() => changeView("reports")} aria-current={activeView === "reports" ? "page" : undefined}><span aria-hidden="true">{"\u25a5"}</span><small>Reports</small></button>
        <button type="button" className={activeView === "settings" ? "active" : ""} onClick={() => changeView("settings")} aria-current={activeView === "settings" ? "page" : undefined}><span aria-hidden="true">{"\u2699"}</span><small>Settings</small></button>
      </nav>

      {entryAdded && (
        <div className="app-toast" role="status" aria-live="polite">
          <span aria-hidden="true">{"\u2713"}</span>
          {entryAdded === "income" ? "Income" : "Expense"} added successfully
        </div>
      )}

      {addingExpense && (
        <div className="modal-backdrop add-expense-backdrop" role="presentation" onMouseDown={() => setAddingExpense(false)}>
          <form className="target-modal add-expense-modal" onSubmit={addEntry} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-expense-title">
            <button className="modal-close" type="button" onClick={() => setAddingExpense(false)} aria-label="Close">{"\u00d7"}</button>
            <p className="eyebrow">Quick entry</p>
            <h2 id="new-expense-title">Add {entryType}</h2>
            <p className="modal-description">{entryType === "expense" ? "Record what you spent and Pocket will update this month automatically." : "Record money you received. It will increase your available balance."}</p>

            <div className="entry-type-toggle" role="group" aria-label="Entry type">
              <button type="button" className={entryType === "expense" ? "active" : ""} onClick={() => setEntryType("expense")}>Expense</button>
              <button type="button" className={entryType === "income" ? "active income-active" : ""} onClick={() => setEntryType("income")}>Income</button>
            </div>

            <label className="expense-amount-field">
              <span>Amount</span>
              <div className="amount-wrap modal-amount-wrap">
                <span>{"\u20b9"}</span>
                <input autoFocus value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" step="1" inputMode="decimal" placeholder="0" aria-label={`${entryType} amount`} required />
              </div>
            </label>

            {entryType === "expense" ? <fieldset className="expense-category-fieldset">
              <legend>Category</legend>
              <div className="category-grid" role="radiogroup" aria-label="Expense category">
                {categories.map((item) => (
                  <button key={item.name} type="button" role="radio" aria-checked={category === item.name} className={category === item.name ? "category-chip selected" : "category-chip"} onClick={() => setCategory(item.name)}>
                    <span aria-hidden="true">{item.icon}</span>{item.name}
                  </button>
                ))}
              </div>
            </fieldset> : (
              <label className="income-source-field">
                <span>Source</span>
                <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Who or where from?" aria-label="Income source" />
              </label>
            )}

            <div className="details-row modal-details-row">
              {entryType === "expense" && <label><span>Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was it for?" aria-label="Expense note" /></label>}
              <label><span>Date</span><input value={date} onChange={(event) => setDate(event.target.value)} type="date" aria-label="Expense date" required /></label>
            </div>
            <button className="primary-button" type="submit">Save {entryType}</button>
          </form>
        </div>
      )}

      {editingName && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingName(false)}>
          <form className="target-modal name-modal" onSubmit={saveName} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="name-title">
            <button className="modal-close" type="button" onClick={() => setEditingName(false)} aria-label="Close">×</button>
            <p className="eyebrow">Personalise Pocket</p>
            <h2 id="name-title">Add your name</h2>
            <p className="modal-description">No login is created. Add a name for personalised headings, or leave it blank to show Pocket.</p>
            <div className="name-input"><input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} type="text" maxLength={24} autoComplete="name" placeholder="Your name (optional)" /></div>
            <button className="primary-button" type="submit">Save</button>
          </form>
        </div>
      )}

      {backupOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setBackupOpen(false)}>
          <section className="target-modal backup-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="backup-title">
            <button className="modal-close" type="button" onClick={() => setBackupOpen(false)} aria-label="Close">{"\u00d7"}</button>
            <p className="eyebrow">Your Pocket data</p>
            <h2 id="backup-title">Backup &amp; restore</h2>
            <p className="modal-description">Save every expense, income, monthly money plan, and preference in one file. The file stays on your device and is never uploaded.</p>

            <div className="backup-summary" aria-label="Backup contents">
              <div><span>Entries</span><strong>{expenses.length + incomes.length}</strong></div>
              <div><span>Monthly plans</span><strong>{new Set([...Object.keys(openingBalances), ...Object.keys(targets), ...Object.keys(savingsTargets)]).size}</strong></div>
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
            <p className="modal-description">Set your starting balance, spending target, and the amount you want to keep as savings.</p>
            <label className="plan-field">
              <span>Total available at month start</span>
              <div className="target-input"><span>₹</span><input autoFocus value={balanceDraft} onChange={(event) => { setBalanceDraft(event.target.value); setPlanError(""); }} type="number" min="1" inputMode="decimal" required /></div>
            </label>
            <label className="plan-field">
              <span>Spending target for this month</span>
              <div className="target-input"><span>₹</span><input value={targetDraft} onChange={(event) => { setTargetDraft(event.target.value); setPlanError(""); }} type="number" min="1" inputMode="decimal" required /></div>
            </label>
            {Number(balanceDraft) > 0 && (
              <div className="plan-recommendation">
                <div>
                  <span>Pocket recommends saving</span>
                  <strong>{draftSavingsRecommendation.amount > 0 ? money.format(draftSavingsRecommendation.amount) : "No safe amount yet"}</strong>
                </div>
                <p>{draftSavingsRecommendation.reason}</p>
                {draftSavingsRecommendation.amount > 0 && <button type="button" onClick={useDraftSavingsRecommendation}>Use this goal</button>}
              </div>
            )}
            <label className="plan-field">
              <span>Savings goal for this month (optional)</span>
              <div className="target-input"><span>₹</span><input value={savingsTargetDraft} onChange={(event) => { setSavingsTargetDraft(event.target.value); setPlanError(""); }} type="number" min="0" inputMode="decimal" placeholder="0" /></div>
            </label>
            {Number(balanceDraft) > 0 && Number(savingsTargetDraft) > 0 && (
              <div className="plan-calculation">
                <span>Available after protecting savings</span>
                <strong>{money.format(Math.max(Number(balanceDraft) - Number(savingsTargetDraft), 0))}</strong>
              </div>
            )}
            {planError && <p className="plan-error" role="alert">{planError}</p>}
            <label className="notification-toggle">
              <span><strong>Phone notification</strong><small>Notify me when the spending target is reached</small></span>
              <input type="checkbox" checked={targetAlertDraft} onChange={(event) => setTargetAlertDraft(event.target.checked)} />
            </label>
            <button className="primary-button" type="submit">Save monthly plan</button>
          </form>
        </div>
      )}
    </main>
  );
}
