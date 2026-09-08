import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("includes every requested expense category", async () => {
  const dashboard = await readFile(new URL("app/PocketDashboard.tsx", root), "utf8");

  for (const category of [
    "Food",
    "Travel",
    "Shopping",
    "Bills",
    "Health",
    "Other",
    "Petrol",
    "Recharge",
  ]) {
    assert.match(dashboard, new RegExp(`name: \\"${category.replace("&", "&")}\\"`));
  }

  assert.match(dashboard, /category-spend-title/);
  assert.match(dashboard, /categoryTotals\.map/);
  assert.ok(dashboard.indexOf('name: "Recharge"') < dashboard.indexOf('name: "Other"'));
  assert.doesNotMatch(dashboard, /name: "Drinks & Smoking"/);
  assert.match(dashboard, /candidate\.category === "Drinks & Smoking" \? "Other"/);
});

test("opens category spend in a dedicated transactions tab", async () => {
  const dashboard = await readFile(new URL("app/PocketDashboard.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /id="monthly-expenses"/);
  assert.match(dashboard, /expense transactions/);
  assert.match(dashboard, /expenseGroups\.map/);
  assert.match(dashboard, /selectCategory\(item\.name\)/);
  assert.match(dashboard, /setActiveView\("transactions"\)/);
  assert.match(dashboard, /Home<\/small>/);
  assert.match(dashboard, /Transactions<\/small>/);
  assert.match(dashboard, /Reports<\/small>/);
  assert.doesNotMatch(dashboard, /Recent expenses|recentLimit|ledgerOpen|View all/);
  assert.match(css, /\.expense-groups/);
  assert.match(css, /\.category-overview-grid/);
  assert.match(css, /\.category-grid[\s\S]*grid-template-columns: repeat\(2, 1fr\)/);
  assert.match(css, /\.category-overview-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.bottom-nav/);
});

test("records income and includes it in the available monthly balance", async () => {
  const dashboard = await readFile(new URL("app/PocketDashboard.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /type Income/);
  assert.match(dashboard, /Record money in or out/);
  assert.match(dashboard, /incomeReceived/);
  assert.match(dashboard, /const totalAvailable = openingBalance \+ incomeReceived/);
  assert.match(dashboard, /Income received/);
  assert.match(dashboard, /setDate\(selectedMonth === monthKey\(\) \? today\(\) : `\$\{selectedMonth\}-01`\)/);
  assert.match(css, /\.entry-type-toggle/);
  assert.match(css, /\.income-ledger/);
});

test("includes personal headings and professional reports", async () => {
  const dashboard = await readFile(new URL("app/PocketDashboard.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /pocket-owner-name/);
  assert.match(dashboard, /Add your name/);
  assert.match(dashboard, /No login is created/);
  assert.match(dashboard, /ownerHeading.*expenses/);
  assert.doesNotMatch(dashboard, /Private on this phone/);
  assert.match(dashboard, /By category/);
  assert.match(dashboard, /Weekly trend/);
  assert.match(dashboard, /category-column-chart/);
  assert.match(dashboard, /weeklyTotals/);
  assert.match(dashboard, /WeeklyTrendChart/);
  assert.match(dashboard, /createLinearGradient/);
  assert.match(dashboard, /Spent &amp; saved/);
  assert.match(dashboard, /balance-circle/);
  assert.match(dashboard, /Pocket recommends/);
  assert.match(css, /\.balance-circle/);
  assert.match(css, /\.category-column-chart/);
  assert.match(css, /\.weekly-line-chart/);
});

test("summarizes completed months and records savings-goal achievement", async () => {
  const dashboard = await readFile(new URL("app/PocketDashboard.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /selectedMonth < monthKey\(\)/);
  assert.match(dashboard, /Completed month/);
  assert.match(dashboard, /Goal achieved/);
  assert.match(dashboard, /Goal not achieved/);
  assert.match(dashboard, /Starting balance/);
  assert.match(dashboard, /Total spent/);
  assert.match(dashboard, /Total saved/);
  assert.match(dashboard, /Savings target/);
  assert.match(css, /\.month-end-summary/);
});

test("supports a monthly target and target-reached notifications", async () => {
  const dashboard = await readFile(new URL("app/PocketDashboard.tsx", root), "utf8");

  assert.match(dashboard, /Set monthly money plan/);
  assert.match(dashboard, /Total available at month start/);
  assert.match(dashboard, /Spending target for this month/);
  assert.match(dashboard, /pocket-opening-balances-v1/);
  assert.match(dashboard, /pocket-monthly-plan-v1-migrated/);
  assert.match(dashboard, /Monthly target reached/);
  assert.match(dashboard, /Notification\.requestPermission/);
  assert.match(dashboard, /registration\.showNotification/);
  assert.match(dashboard, /pocket-target-notified-/);
  assert.match(dashboard, /target-progress-ring/);
  assert.match(dashboard, /transactions-target-ring/);
  assert.doesNotMatch(dashboard, /spending target cannot be higher than your starting balance/i);
  assert.doesNotMatch(dashboard, /target and savings goal cannot be more than your starting balance/i);
  assert.doesNotMatch(dashboard, /max=\{balanceDraft/);
});

test("exports and safely restores a complete local backup", async () => {
  const dashboard = await readFile(new URL("app/PocketDashboard.tsx", root), "utf8");
  const nativeBackup = await readFile(new URL("android/app/src/main/java/com/rachit/pocket/PocketBackupPlugin.java", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");

  assert.match(dashboard, /Backup &amp; restore/);
  assert.match(dashboard, /Download backup/);
  assert.match(dashboard, /Restore from backup/);
  assert.match(dashboard, /parseBackup/);
  assert.match(dashboard, /openingBalances/);
  assert.match(dashboard, /pocket-incomes-v1/);
  assert.match(dashboard, /version: 4/);
  assert.match(dashboard, /incomes/);
  assert.match(dashboard, /pocket-backup-\$\{today\(\)\}\.json/);
  assert.match(dashboard, /Capacitor\.isNativePlatform\(\)/);
  assert.match(dashboard, /NativeBackup\.saveBackup/);
  assert.match(nativeBackup, /Intent\.ACTION_CREATE_DOCUMENT/);
  assert.match(nativeBackup, /openOutputStream/);
  assert.match(dashboard, /This will replace the Pocket data currently on this device/);
  assert.match(dashboard, /No data was changed/);
  assert.match(dashboard, /never uploaded/);
  assert.match(css, /\.backup-summary/);
  assert.match(css, /\.backup-status-error/);
});

test("migrates legacy phone data and supports offline launches", async () => {
  const dashboard = await readFile(new URL("app/PocketDashboard.tsx", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const serviceWorker = await readFile(new URL("public/sw.js", root), "utf8");

  assert.match(dashboard, /pocket-expenses-v3/);
  assert.match(dashboard, /\^pocket-\.\+-expenses\$/);
  assert.match(dashboard, /new Map<string, Expense>/);
  assert.match(dashboard, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  assert.doesNotMatch(page, /requireChatGPTUser|force-dynamic/);
  assert.match(serviceWorker, /pocket-offline-v20/);
  assert.match(serviceWorker, /precacheApp/);
  assert.match(serviceWorker, /Promise\.allSettled/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /notificationclick/);
});
