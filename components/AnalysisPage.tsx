"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, getMonthRange, monthKey } from "@/lib/date";
import { accountComparableTotal, calculateOutingValue, categoryAccent, comparableValue, debtValue, trackedComparableChange } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Category, CategoryGroup, Debt, MonthClosing, RecurringTransaction, Transaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

function lastMonthKeys(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return monthKey(date);
  });
}

function nextMonthKeys(count = 6) {
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
  width: 340,
  height: 172,
  left: 46,
  right: 12,
  top: 14,
  bottom: 34
};

type ClosingBalance = { closing_id: string; account_id: string; actual_balance: number };
type ClosingDebt = { closing_id: string; debt_id: string; actual_amount: number };

type ClosingBundle = MonthClosing & {
  balances: ClosingBalance[];
  debtValues: ClosingDebt[];
};

export function AnalysisPage() {
  const { session, loading } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [closings, setClosings] = useState<ClosingBundle[]>([]);
  const months = useMemo(() => lastMonthKeys(6), []);
  const futureMonths = useMemo(() => nextMonthKeys(6), []);

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

  function outingForMonth(month: string, outingGroupId: string | null) {
    const range = getMonthRange(month);
    const monthTransactions = transactions.filter((tx) => tx.date >= range.start && tx.date <= range.end);
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

  const rows = useMemo(() => {
    const outingGroup = groups.find((group) => group.name.toLowerCase() === "ausgehen");
    return groups.map((group) => {
      const values = months.map((month) => {
        const range = getMonthRange(month);
        const spent = group.id === outingGroup?.id
          ? outingForMonth(month, outingGroup.id)
          : transactions
            .filter((tx) => tx.type === "expense" && tx.group_id === group.id && tx.date >= range.start && tx.date <= range.end)
            .reduce((sum, tx) => sum + Number(tx.amount), 0);
        return { month, spent };
      });
      const max = Math.max(1, ...values.map((value) => Math.abs(value.spent)));
      const average = values.reduce((sum, value) => sum + value.spent, 0) / values.length;
      const total = values.reduce((sum, value) => sum + value.spent, 0);
      const childBudget = categories.filter((category) => category.group_id === group.id).reduce((sum, category) => sum + Number(category.average_monthly_budget), 0);
      const budget = childBudget || Number(group.average_monthly_budget) || 0;
      return { group, values, max, average, total, budget, delta: average - budget };
    });
  }, [groups, categories, transactions, months, accounts, debts, closings]);

  const totalCurrentMonth = useMemo(() => {
    const current = months[months.length - 1];
    return rows.reduce((sum, row) => sum + (row.values.find((value) => value.month === current)?.spent ?? 0), 0);
  }, [rows, months]);

  const projection = useMemo(() => {
    const currentOuting = groups.find((group) => group.name.toLowerCase() === "ausgehen");
    const monthlyIncome = months.map((month) => {
      const range = getMonthRange(month);
      return transactions.filter((tx) => tx.type === "income" && tx.date >= range.start && tx.date <= range.end).reduce((sum, tx) => sum + Number(tx.amount), 0);
    });
    const monthlyExpenses = months.map((month) => {
      const range = getMonthRange(month);
      const monthTransactions = transactions.filter((tx) => tx.date >= range.start && tx.date <= range.end);
      const tracked = monthTransactions.filter((tx) => tx.type === "expense" && tx.group_id !== currentOuting?.id).reduce((sum, tx) => sum + Number(tx.amount), 0);
      const outing = currentOuting ? outingForMonth(month, currentOuting.id) : 0;
      return tracked + outing;
    });
    const avgIncome = monthlyIncome.reduce((sum, value) => sum + value, 0) / Math.max(1, monthlyIncome.length);
    const avgExpenses = monthlyExpenses.reduce((sum, value) => sum + value, 0) / Math.max(1, monthlyExpenses.length);
    const fixedIncome = recurring.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
    const fixedExpenses = recurring.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
    const expectedIncome = Math.max(avgIncome, fixedIncome);
    const expectedExpenses = Math.max(avgExpenses, fixedExpenses);
    return futureMonths.map((month, index) => ({
      month,
      income: expectedIncome,
      expenses: expectedExpenses,
      balance: (expectedIncome - expectedExpenses) * (index + 1)
    }));
  }, [transactions, recurring, months, futureMonths, groups, accounts, debts, closings]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard analysis-page">
        <section className="hero-card compact">
          <h1>{formatEuro(totalCurrentMonth)}</h1>
        </section>

        <section className="cards-stack monthly-analysis-stack">
          {rows.map(({ group, values, max, average, total }) => {
            const accent = categoryAccent(group.name, group.color);
            const plotWidth = chart.width - chart.left - chart.right;
            const plotHeight = chart.height - chart.top - chart.bottom;
            const pointStep = values.length > 1 ? plotWidth / (values.length - 1) : plotWidth;
            const valueToY = (value: number) => chart.top + plotHeight - (Math.max(0, value) / max) * plotHeight;
            const averageY = valueToY(Math.max(0, average));
            const points = values.map((value, index) => ({
              ...value,
              x: chart.left + index * pointStep,
              y: valueToY(value.spent)
            }));
            const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
            return (
              <article className="monthly-chart-card" key={group.id} style={{ ["--accent" as string]: accent }}>
                <div className="monthly-group-head">
                  <strong>{group.name}</strong>
                  <b>{formatEuro(total)}</b>
                </div>
                <svg className="analysis-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`${group.name} Ausgabenverlauf`}>
                  <line className="chart-axis" x1={chart.left} y1={chart.top} x2={chart.left} y2={chart.top + plotHeight} />
                  <line className="chart-axis" x1={chart.left} y1={chart.top + plotHeight} x2={chart.width - chart.right} y2={chart.top + plotHeight} />
                  <text className="chart-y-label" x={chart.left - 8} y={chart.top + 6} textAnchor="end">{formatEuro(max)}</text>
                  <text className="chart-y-label" x={chart.left - 8} y={chart.top + plotHeight} textAnchor="end">€ 0,00</text>
                  <polyline className="chart-line" points={linePoints} />
                  {points.map((point) => (
                    <g key={point.month}>
                      <text className="chart-value-label" x={point.x} y={Math.max(chart.top + 9, point.y - 8)} textAnchor="middle">{formatEuro(point.spent)}</text>
                      <circle className="chart-point" cx={point.x} cy={point.y} r="4" />
                      <text className="chart-x-label" x={point.x} y={chart.height - 12} textAnchor="middle">{shortMonth(point.month)}</text>
                    </g>
                  ))}
                  <line className="chart-average" x1={chart.left} y1={averageY} x2={chart.width - chart.right} y2={averageY} />
                  <text className="chart-average-label" x={chart.width - chart.right} y={Math.max(chart.top + 10, averageY - 5)} textAnchor="end">Ø {formatEuro(average)}</text>
                </svg>
              </article>
            );
          })}
          {!rows.length && <p className="muted center">Keine Daten.</p>}
        </section>

        <section className="analysis-summary-card">
          <h2>Durchschnitt vs. Budget</h2>
          <div className="analysis-summary-list">
            {rows.map(({ group, average, budget, delta }) => (
              <div key={group.id} className="analysis-summary-row" style={{ ["--accent" as string]: categoryAccent(group.name, group.color) }}>
                <span>{group.name}</span>
                <strong>{formatEuro(average)} / {formatEuro(budget)}</strong>
                <b className={delta > 0 ? "over" : "under"}>{delta > 0 ? "+" : ""}{formatEuro(delta)}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="analysis-summary-card">
          <h2>Projektion</h2>
          <div className="analysis-summary-list">
            {projection.map((item) => (
              <div key={item.month} className="projection-row">
                <span>{shortMonth(item.month)}</span>
                <strong>{formatEuro(item.income)} / {formatEuro(item.expenses)}</strong>
                <b className={item.balance >= 0 ? "under" : "over"}>{item.balance >= 0 ? "+" : ""}{formatEuro(item.balance)}</b>
              </div>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
