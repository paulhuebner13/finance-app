"use client";

import { adjustedMonthlyLimit, formatEuro, plannedUntilCurrentDay } from "@/lib/date";
import type { CategoryWithChildren, Transaction } from "@/lib/types";

type Props = {
  group: CategoryWithChildren;
  transactions: Transaction[];
  daysInMonth: number;
  currentDay: number;
  expanded?: boolean;
  onClick?: () => void;
};

function groupBudget(group: CategoryWithChildren, daysInMonth: number, currentDay: number) {
  const groupLimit = adjustedMonthlyLimit(group.average_monthly_budget, daysInMonth, group.budget_period);
  const groupPlan = plannedUntilCurrentDay(group.average_monthly_budget, currentDay, group.budget_period);
  const childLimit = group.categories.reduce((sum, category) => sum + adjustedMonthlyLimit(category.average_monthly_budget, daysInMonth, category.budget_period), 0);
  const childPlan = group.categories.reduce((sum, category) => sum + plannedUntilCurrentDay(category.average_monthly_budget, currentDay, category.budget_period), 0);
  return {
    limit: Math.max(groupLimit, childLimit),
    plan: Math.max(groupPlan, childPlan)
  };
}

function spentFor(transactions: Transaction[], categoryId?: string) {
  return transactions
    .filter((transaction) => transaction.type === "expense" && (!categoryId || transaction.category_id === categoryId))
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
}

export function BudgetCard({ group, transactions, daysInMonth, currentDay, expanded = false, onClick }: Props) {
  const spent = spentFor(transactions);
  const budget = groupBudget(group, daysInMonth, currentDay);
  const spentPercent = budget.limit > 0 ? Math.min(120, (spent / budget.limit) * 100) : 0;
  const planPercent = budget.limit > 0 ? Math.min(100, (budget.plan / budget.limit) * 100) : 0;
  const remaining = budget.limit - spent;

  return (
    <article className={`budget-card ${expanded ? "expanded" : ""}`} style={{ ["--accent" as string]: group.color }}>
      <button className="budget-main" onClick={onClick} type="button">
        <div className="budget-card-header">
          <div>
            <p className="card-title">{group.name}</p>
            <p className="muted small">{formatEuro(remaining)}</p>
          </div>
          <strong>{formatEuro(spent)}</strong>
        </div>

        <div className="budget-bar" aria-label={`${group.name} Budgetfortschritt`}>
          <div className="budget-fill" style={{ width: `${spentPercent}%` }} />
          <div className="budget-marker" style={{ left: `${planPercent}%` }} />
        </div>
      </button>

      {expanded && (
        <div className="subcategory-panel">
          {group.categories.map((category) => {
            const categorySpent = spentFor(transactions, category.id);
            const limit = adjustedMonthlyLimit(category.average_monthly_budget, daysInMonth, category.budget_period);
            const percent = limit > 0 ? Math.min(120, (categorySpent / limit) * 100) : 0;
            return (
              <div className="subcategory-row" key={category.id}>
                <div className="subcategory-head">
                  <span>{category.name}</span>
                  <b>{formatEuro(categorySpent)} / {formatEuro(limit)}</b>
                </div>
                <div className="mini-bar">
                  <div style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
