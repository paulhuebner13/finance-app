"use client";

import { adjustedMonthlyLimit, formatEuro, plannedUntilCurrentDay } from "@/lib/date";
import type { CategoryGroup } from "@/lib/types";

type Props = {
  group: CategoryGroup;
  spent: number;
  daysInMonth: number;
  currentDay: number;
};

export function BudgetCard({ group, spent, daysInMonth, currentDay }: Props) {
  const monthLimit = adjustedMonthlyLimit(group.average_monthly_budget, daysInMonth);
  const planNow = plannedUntilCurrentDay(group.average_monthly_budget, currentDay);
  const spentPercent = monthLimit > 0 ? Math.min(120, (spent / monthLimit) * 100) : 0;
  const planPercent = monthLimit > 0 ? Math.min(100, (planNow / monthLimit) * 100) : 0;
  const delta = spent - planNow;
  const remaining = monthLimit - spent;

  return (
    <article className="budget-card" style={{ ["--accent" as string]: group.color }}>
      <div className="budget-card-header">
        <div>
          <p className="card-title">{group.name}</p>
          <p className="muted small">Limit: {formatEuro(monthLimit)}</p>
        </div>
        <strong>{formatEuro(spent)}</strong>
      </div>

      <div className="budget-bar" aria-label={`${group.name} Budgetfortschritt`}>
        <div className="budget-fill" style={{ width: `${spentPercent}%` }} />
        <div className="budget-marker" style={{ left: `${planPercent}%` }} />
      </div>

      <div className="budget-meta">
        <span>Plan: {formatEuro(planNow)}</span>
        <span>{delta >= 0 ? "+" : ""}{formatEuro(delta)}</span>
        <span>Rest: {formatEuro(remaining)}</span>
      </div>
    </article>
  );
}
