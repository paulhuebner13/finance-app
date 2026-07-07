"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, getMonthRange, monthKey } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { CategoryGroup, Transaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

function lastMonthKeys(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return monthKey(date);
  });
}

function shortMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("de-AT", { month: "short" }).format(new Date(year, month - 1, 1));
}

export function AnalysisPage() {
  const { session, loading } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const months = useMemo(() => lastMonthKeys(6), []);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const firstRange = getMonthRange(months[0]);
    const lastRange = getMonthRange(months[months.length - 1]);
    const [txRes, groupRes] = await Promise.all([
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
        .order("sort_order")
    ]);
    setTransactions((txRes.data ?? []) as Transaction[]);
    setGroups((groupRes.data ?? []) as CategoryGroup[]);
  }, [session?.user.id, months]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    return groups.map((group) => {
      const values = months.map((month) => {
        const range = getMonthRange(month);
        const spent = transactions
          .filter((tx) => tx.type === "expense" && tx.group_id === group.id && tx.date >= range.start && tx.date <= range.end)
          .reduce((sum, tx) => sum + Number(tx.amount), 0);
        return { month, spent };
      });
      const max = Math.max(1, ...values.map((value) => value.spent));
      const total = values.reduce((sum, value) => sum + value.spent, 0);
      return { group, values, max, total };
    });
  }, [groups, transactions, months]);

  const totalCurrentMonth = useMemo(() => {
    const current = months[months.length - 1];
    const range = getMonthRange(current);
    return transactions
      .filter((tx) => tx.type === "expense" && tx.date >= range.start && tx.date <= range.end)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
  }, [transactions, months]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard analysis-page">
        <section className="hero-card compact">
          <h1>{formatEuro(totalCurrentMonth)}</h1>
        </section>

        <section className="cards-stack monthly-analysis-stack">
          {rows.map(({ group, values, max, total }) => (
            <article className="monthly-group-card" key={group.id} style={{ ["--accent" as string]: group.color }}>
              <div className="monthly-group-head">
                <strong>{group.name}</strong>
                <b>{formatEuro(total)}</b>
              </div>
              <div className="month-bars">
                {values.map((value) => (
                  <div className="month-bar-row" key={value.month}>
                    <span>{shortMonth(value.month)}</span>
                    <div className="month-bar-track">
                      <div style={{ width: `${Math.min(100, (value.spent / max) * 100)}%` }} />
                    </div>
                    <b>{formatEuro(value.spent)}</b>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!rows.length && <p className="muted center">Keine Daten.</p>}
        </section>
      </main>
    </AppShell>
  );
}
