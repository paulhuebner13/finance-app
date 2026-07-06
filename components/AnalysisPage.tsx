"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { adjustedMonthlyLimit, dayOfMonth, daysInMonth, formatEuro, getMonthRange, monthKey, plannedUntilCurrentDay } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Category, CategoryGroup, Transaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function AnalysisPage() {
  const { session, loading } = useSession();
  const [month, setMonth] = useState(monthKey());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const range = getMonthRange(month);
    const [txRes, groupRes, categoryRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", session.user.id).gte("date", range.start).lte("date", range.end),
      supabase.from("category_groups").select("*").eq("user_id", session.user.id).order("sort_order"),
      supabase.from("categories").select("*").eq("user_id", session.user.id).order("sort_order")
    ]);
    setTransactions((txRes.data ?? []) as Transaction[]);
    setGroups((groupRes.data ?? []) as CategoryGroup[]);
    setCategories((categoryRes.data ?? []) as Category[]);
  }, [session?.user.id, month]);

  useEffect(() => { load(); }, [load]);

  const monthDays = daysInMonth(new Date(`${month}-01T12:00:00`));
  const currentDay = month === monthKey() ? dayOfMonth() : monthDays;

  const byGroup = useMemo(() => {
    return groups.filter((g) => g.kind === "expense").map((group) => {
      const groupCategories = categories.filter((category) => category.group_id === group.id && category.is_active);
      const spent = transactions.filter((t) => t.type === "expense" && t.group_id === group.id).reduce((sum, t) => sum + Number(t.amount), 0);
      const limit = groupCategories.reduce((sum, category) => sum + adjustedMonthlyLimit(Number(category.average_monthly_budget), monthDays, category.budget_period), 0);
      const plan = groupCategories.reduce((sum, category) => sum + plannedUntilCurrentDay(Number(category.average_monthly_budget), currentDay, category.budget_period), 0);
      return { group, spent, limit, plan, percent: limit > 0 ? Math.min(120, (spent / limit) * 100) : 0 };
    });
  }, [groups, categories, transactions, monthDays, currentDay]);

  const bySubcategory = useMemo(() => {
    return categories.map((category) => {
      const group = groups.find((g) => g.id === category.group_id);
      const spent = transactions.filter((t) => t.type === "expense" && t.category_id === category.id).reduce((sum, t) => sum + Number(t.amount), 0);
      return { category, group, spent };
    }).filter((row) => row.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 12);
  }, [categories, groups, transactions]);

  const totals = useMemo(() => ({
    expenses: transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0),
    income: transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0),
    investment: transactions.filter((t) => t.type === "investment").reduce((sum, t) => sum + Number(t.amount), 0)
  }), [transactions]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="hero-card compact">
          <h1>{formatEuro(totals.expenses)}</h1>
          <div className="summary-grid">
            <div><span>Einnahmen</span><strong>{formatEuro(totals.income)}</strong></div>
            <div><span>Investiert</span><strong>{formatEuro(totals.investment)}</strong></div>
          </div>
        </section>

        <section className="filters-card one">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </section>

        <section className="list-card">
          
          <div className="analysis-bars">
            {byGroup.map(({ group, spent, limit, plan, percent }) => (
              <div className="analysis-row" key={group.id} style={{ ["--accent" as string]: group.color }}>
                <div className="analysis-head"><strong>{group.name}</strong><span>{formatEuro(spent)} / {formatEuro(limit)}</span></div>
                <div className="budget-bar"><div className="budget-fill" style={{ width: `${percent}%` }} /><div className="budget-marker" style={{ left: `${limit > 0 ? Math.min(100, (plan / limit) * 100) : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="list-card">
          
          {bySubcategory.map(({ category, group, spent }) => (
            <div className="tx-row" key={category.id}>
              <div><strong>{category.name}</strong><span>{group?.name}</span></div>
              <b>{formatEuro(spent)}</b>
            </div>
          ))}
          {!bySubcategory.length && <p className="muted center">Keine Ausgaben.</p>}
        </section>
      </main>
    </AppShell>
  );
}
