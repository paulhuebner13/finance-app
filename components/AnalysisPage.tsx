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

const chart = {
  width: 340,
  height: 172,
  left: 46,
  right: 12,
  top: 14,
  bottom: 34
};

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
      const average = values.reduce((sum, value) => sum + value.spent, 0) / values.length;
      const total = values.reduce((sum, value) => sum + value.spent, 0);
      return { group, values, max, average, total };
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
          {rows.map(({ group, values, max, average, total }) => {
            const plotWidth = chart.width - chart.left - chart.right;
            const plotHeight = chart.height - chart.top - chart.bottom;
            const pointStep = values.length > 1 ? plotWidth / (values.length - 1) : plotWidth;
            const valueToY = (value: number) => chart.top + plotHeight - (value / max) * plotHeight;
            const averageY = valueToY(average);
            const points = values.map((value, index) => ({
              ...value,
              x: chart.left + index * pointStep,
              y: valueToY(value.spent)
            }));
            const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
            return (
              <article className="monthly-chart-card" key={group.id} style={{ ["--accent" as string]: group.color }}>
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
      </main>
    </AppShell>
  );
}
