export const AVERAGE_DAYS_PER_MONTH = 30.44;

export function todayISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function previousMonthKey(date = new Date()) {
  return monthKey(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

export function daysInMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function daysInMonthFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export function dayOfMonth(date = new Date()) {
  return date.getDate();
}

export function getMonthRange(key: string) {
  const [year, month] = key.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, year, month, days: last };
}

export function dateForMonthDay(key: string, day: number) {
  const range = getMonthRange(key);
  const safeDay = Math.min(Math.max(1, day), range.days);
  return `${range.year}-${String(range.month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

export function formatEuro(value: number) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatMonthTitle(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export type BudgetPeriodLike = "daily" | "monthly";

export function adjustedMonthlyLimit(averageMonthlyBudget: number, days: number, period: BudgetPeriodLike = "daily") {
  const budget = Number(averageMonthlyBudget) || 0;
  if (period === "monthly") return budget;
  return (budget / AVERAGE_DAYS_PER_MONTH) * days;
}

export function plannedUntilCurrentDay(averageMonthlyBudget: number, currentDay: number, period: BudgetPeriodLike = "daily") {
  const budget = Number(averageMonthlyBudget) || 0;
  if (period === "monthly") return budget;
  return (budget / AVERAGE_DAYS_PER_MONTH) * currentDay;
}
