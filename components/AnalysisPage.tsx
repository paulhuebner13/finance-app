"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, getMonthRange, monthKey } from "@/lib/date";
import { accountComparableTotal, calculateOutingValue, categoryAccent, comparableValue, debtValue, depotNetValue, trackedComparableChange } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Category, CategoryGroup, Debt, MonthClosing, RecurringTransaction, Transaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

function lastMonthKeys(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return monthKey(date);
  });
}

function nextMonthKeys(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index + 1, 1);
    return monthKey(date);
  });
}

function previousMonthFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 2, 1));
}

function shortMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("de-AT", { month: "short" }).format(new Date(year, month - 1, 1));
}

const chart = {
  width: 372,
  height: 182,
  left: 52,
  right: 14,
  top: 18,
  bottom: 36
};

type ClosingBalance = { closing_id: string; account_id: string; actual_balance: number };
type ClosingDebt = { closing_id: string; debt_id: string; actual_amount: number };

type ClosingBundle = MonthClosing & {
  balances: ClosingBalance[];
  debtValues: ClosingDebt[];
};

type ChartPointValue = { month: string; spent: number };

type ChartRow = {
  id: string;
  name: string;
  accent: string;
  values: ChartPointValue[];
  average: number;
  budget?: number;
  delta?: number;
  isDifference?: boolean;
};

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampChartRange(values: number[], avg: number) {
  const rawMin = Math.min(0, avg, ...values);
  const rawMax = Math.max(0, avg, ...values);
  if (rawMin === rawMax) return { min: 0, max: Math.max(1, rawMax || 1) };
  const padding = (rawMax - rawMin) * 0.14;
  return { min: rawMin - padding, max: rawMax + padding };
}

function currentNetWorth(accounts: Account[], debts: Debt[]) {
  const active = accounts
    .filter((account) => account.type === "active" && account.include_in_available_net_worth)
    .reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const depot = accounts
    .filter((account) => account.type === "investment")
    .reduce((sum, account) => sum + depotNetValue(Number(account.balance || 0), Number(account.cost_basis || 0)), 0);
  const debt = debts.reduce((sum, item) => sum + debtValue(item), 0);
  return active + depot + debt;
}

function ChartCard({ row }: { row: ChartRow }) {
  const values = row.values.map((value) => value.spent);
  const { min, max } = clampChartRange(values, row.average);
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const pointStep = row.values.length > 1 ? plotWidth / (row.values.length - 1) : plotWidth;
  const valueToY = (value: number) => {
    const ratio = (value - min) / Math.max(1, max - min);
    return chart.top + plotHeight - ratio * plotHeight;
  };
  const zeroY = valueToY(0);
  const averageY = valueToY(row.average);
  const points = row.values.map((value, index) => ({
    ...value,
    x: chart.left + index * pointStep,
    y: valueToY(value.spent)
  }));
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <article className="monthly-chart-card" style={{ ["--accent" as string]: row.accent }}>
      <div className="monthly-group-head">
        <strong>{row.name}</strong>
        <b>Ø {formatEuro(row.average)}</b>
      </div>
      <svg className="analysis-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`${row.name} Verlauf`}>
        <line className="chart-axis" x1={chart.left} y1={chart.top} x2={chart.left} y2={chart.top + plotHeight} />
        <line className="chart-axis" x1={chart.left} y1={zeroY} x2={chart.width - chart.right} y2={zeroY} />
        <text className="chart-y-label" x={chart.left - 8} y={chart.top + 6} textAnchor="end">{formatEuro(max)}</text>
        <text className="chart-y-label" x={chart.left - 8} y={chart.top + plotHeight} textAnchor="end">{formatEuro(min)}</text>
        <polyline className="chart-line" points={linePoints} />
        {points.map((point) => (
          <g key={point.month}>
            <text className="chart-value-label" x={point.x} y={Math.max(chart.top + 10, point.y - 8)} textAnchor="middle">{formatEuro(point.spent)}</text>
            <circle className="chart-point" cx={point.x} cy={point.y} r="3.6" />
            <text className="chart-x-label" x={point.x} y={chart.height - 12} textAnchor="middle">{shortMonth(point.month)}</text>
          </g>
        ))}
        <line className="chart-average" x1={chart.left} y1={averageY} x2={chart.width - chart.right} y2={averageY} />
        <text className="chart-average-label" x={chart.width - chart.right} y={Math.max(chart.top + 10, averageY - 5)} textAnchor="end">Ø {formatEuro(row.average)}</text>
      </svg>
    </article>
  );
}

export function AnalysisPage() {
  const { session, loading } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [closings, setClosings] = useState<ClosingBundle[]>([]);
  const months = useMemo(() => lastMonthKeys(12), []);
  const futureMonths = useMemo(() => nextMonthKeys(12), []);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const firstRange = getMonthRange(months[0]);
    const lastRange = getMonthRange(months[months.length - 1]);
    const closingMonths = [previousMonthFromKey(months[0]), ...months];
    const [txRes, groupRes, categoryRes, accountRes, debtRes, recurringRes, closingRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", session.user.id)
        .gte("date", firstRange.start)
        .lte("date", lastRange.end),
      supabase
        .from("category_groups")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("kind", "expense")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("categories")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("accounts")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_active", true),
      supabase
        .from("debts")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_active", true),
      supabase
        .from("recurring_transactions")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("active", true),
      supabase
        .from("month_closings")
        .select("*")
        .eq("user_id", session.user.id)
        .in("month", closingMonths)
    ]);

    const closingRows = (closingRes.data ?? []) as MonthClosing[];
    const closingIds = closingRows.map((closing) => closing.id);
    let balances: ClosingBalance[] = [];
    let debtValues: ClosingDebt[] = [];
    if (closingIds.length) {
      const [balanceRes, debtValueRes] = await Promise.all([
        supabase.from("month_closing_balances").select("closing_id, account_id, actual_balance").in("closing_id", closingIds),
        supabase.from("month_closing_debts").select("closing_id, debt_id, actual_amount").in("closing_id", closingIds)
      ]);
      balances = (balanceRes.data ?? []) as ClosingBalance[];
      debtValues = (debtValueRes.data ?? []) as ClosingDebt[];
    }

    setTransactions((txRes.data ?? []) as Transaction[]);
    setGroups((groupRes.data ?? []) as CategoryGroup[]);
    setCategories((categoryRes.data ?? []) as Category[]);
    setAccounts((accountRes.data ?? []) as Account[]);
    setDebts((debtRes.data ?? []) as Debt[]);
    setRecurring((recurringRes.data ?? []) as RecurringTransaction[]);
    setClosings(closingRows.map((closing) => ({
      ...closing,
      balances: balances.filter((balance) => balance.closing_id === closing.id),
      debtValues: debtValues.filter((debt) => debt.closing_id === closing.id)
    })));
  }, [session?.user.id, months]);

  useEffect(() => { load(); }, [load]);

  function comparableForClosing(closing: ClosingBundle | undefined) {
    if (!closing) return null;
    if (closing.comparable_value !== null && closing.comparable_value !== undefined) return Number(closing.comparable_value);
    const accountTotal = closing.balances.reduce((sum, balance) => {
      const account = accounts.find((item) => item.id === balance.account_id);
      if (!account) return sum;
      return sum + accountComparableTotal([{
        type: account.type,
        include_in_available_net_worth: account.include_in_available_net_worth,
        balance: Number(balance.actual_balance)
      }]);
    }, 0);
    const debtTotal = closing.debt_net_value !== null && closing.debt_net_value !== undefined
      ? Number(closing.debt_net_value)
      : closing.debtValues.reduce((sum, item) => {
        const debt = debts.find((debtRow) => debtRow.id === item.debt_id);
        if (!debt) return sum;
        return sum + debtValue({ amount: Number(item.actual_amount), kind: debt.kind });
      }, 0);
    return accountTotal + debtTotal;
  }

  function transactionsForMonth(month: string) {
    const range = getMonthRange(month);
    return transactions.filter((tx) => tx.date >= range.start && tx.date <= range.end);
  }

  function outingForMonth(month: string, outingGroupId: string | null) {
    const monthTransactions = transactionsForMonth(month);
    const openingComparable = comparableForClosing(closings.find((closing) => closing.month === previousMonthFromKey(month)));
    const currentComparable = month === monthKey()
      ? comparableValue(accounts, debts)
      : comparableForClosing(closings.find((closing) => closing.month === month));

    const trackedChange = trackedComparableChange({
      transactions: monthTransactions,
      accounts,
      outingGroupId
    });

    return calculateOutingValue({
      openingComparable,
      currentComparable,
      trackedComparableChange: trackedChange
    });
  }

  function incomeForMonth(month: string) {
    return transactionsForMonth(month)
      .filter((tx) => tx.type === "income")
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
  }

  function expensesForMonth(month: string, outingGroupId: string | null) {
    const tracked = transactionsForMonth(month)
      .filter((tx) => tx.type === "expense" && tx.group_id !== outingGroupId)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
    const outing = outingGroupId ? outingForMonth(month, outingGroupId) : 0;
    return tracked + outing;
  }

  const chartRows = useMemo(() => {
    const outingGroup = groups.find((group) => group.name.toLowerCase() === "ausgehen");
    const incomeValues = months.map((month) => ({ month, spent: incomeForMonth(month) }));
    const expenseValues = months.map((month) => ({ month, spent: expensesForMonth(month, outingGroup?.id ?? null) }));
    const diffValues = months.map((month, index) => ({
      month,
      spent: incomeValues[index].spent - expenseValues[index].spent
    }));

    const introRows: ChartRow[] = [
      { id: "income", name: "Einnahmen", accent: "#16a34a", values: incomeValues, average: average(incomeValues.map((value) => value.spent)) },
      { id: "expenses", name: "Ausgaben gesamt", accent: "#ef4444", values: expenseValues, average: average(expenseValues.map((value) => value.spent)) },
      { id: "difference", name: "Differenz", accent: "#3258a8", values: diffValues, average: average(diffValues.map((value) => value.spent)), isDifference: true }
    ];

    const detailRows: ChartRow[] = groups.map((group) => {
      const values = months.map((month) => {
        const range = getMonthRange(month);
        const spent = group.id === outingGroup?.id
          ? outingForMonth(month, outingGroup.id)
          : transactions
            .filter((tx) => tx.type === "expense" && tx.group_id === group.id && tx.date >= range.start && tx.date <= range.end)
            .reduce((sum, tx) => sum + Number(tx.amount), 0);
        return { month, spent };
      });
      const avg = average(values.map((value) => value.spent));
      const childBudget = categories.filter((category) => category.group_id === group.id).reduce((sum, category) => sum + Number(category.average_monthly_budget), 0);
      const budget = childBudget || Number(group.average_monthly_budget) || 0;
      return {
        id: group.id,
        name: group.name,
        accent: categoryAccent(group.name, group.color),
        values,
        average: avg,
        budget,
        delta: avg - budget
      };
    });

    return { introRows, detailRows, allRows: [...introRows, ...detailRows] };
  }, [groups, categories, transactions, months, accounts, debts, closings]);

  const projection = useMemo(() => {
    const fixedIncome = recurring.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
    const avgExpenses = average(chartRows.introRows.find((row) => row.id === "expenses")?.values.map((value) => value.spent) ?? []);
    const monthlyDelta = fixedIncome - avgExpenses;
    const startValue = currentNetWorth(accounts, debts);
    const values = futureMonths.map((month, index) => ({
      month,
      spent: startValue + monthlyDelta * (index + 1)
    }));
    return { fixedIncome, avgExpenses, monthlyDelta, startValue, values, average: average(values.map((value) => value.spent)) };
  }, [recurring, chartRows.introRows, futureMonths, accounts, debts]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard analysis-page">
        <section className="cards-stack monthly-analysis-stack">
          {chartRows.introRows.map((row) => <ChartCard key={row.id} row={row} />)}
        </section>

        <section className="analysis-summary-card projection-card">
          <div className="projection-head">
            <div>
              <h2>Projektion</h2>
              <p className="muted">Fixe Einnahmen aus Regeln gegen Ø Ausgaben.</p>
            </div>
            <strong className={projection.monthlyDelta >= 0 ? "under" : "over"}>{projection.monthlyDelta >= 0 ? "+" : ""}{formatEuro(projection.monthlyDelta)}</strong>
          </div>
          <div className="projection-kpis">
            <span>Fixe Einnahmen <b>{formatEuro(projection.fixedIncome)}</b></span>
            <span>Ø Ausgaben <b>{formatEuro(projection.avgExpenses)}</b></span>
            <span>Startwert <b>{formatEuro(projection.startValue)}</b></span>
          </div>
          <ChartCard row={{ id: "net-worth-projection", name: "Net Worth nächste 12 Monate", accent: "#14b8a6", values: projection.values, average: projection.average }} />
        </section>

        <section className="analysis-summary-card">
          <h2>Durchschnitt vs. Budget</h2>
          <div className="analysis-summary-list">
            {chartRows.detailRows.map(({ id, name, average: avg, budget, delta, accent }) => (
              <div key={id} className="analysis-summary-row" style={{ ["--accent" as string]: accent }}>
                <span>{name}</span>
                <strong>{formatEuro(avg)} / {formatEuro(budget ?? 0)}</strong>
                <b className={(delta ?? 0) > 0 ? "over" : "under"}>{(delta ?? 0) > 0 ? "+" : ""}{formatEuro(delta ?? 0)}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="cards-stack monthly-analysis-stack">
          {chartRows.detailRows.map((row) => <ChartCard key={row.id} row={row} />)}
          {!chartRows.allRows.length && <p className="muted center">Keine Daten.</p>}
        </section>
      </main>
    </AppShell>
  );
}
