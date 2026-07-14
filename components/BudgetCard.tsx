"use client";

import { adjustedMonthlyLimit, formatEuro, plannedUntilCurrentDay } from "@/lib/date";
import { categoryAccent } from "@/lib/finance";
import type { CategoryWithChildren, Transaction } from "@/lib/types";

type Props = {
  group: CategoryWithChildren;
  transactions: Transaction[];
  daysInMonth: number;
  currentDay: number;
  expanded?: boolean;
  onClick?: () => void;
  overrideSpent?: number;
};

function activeCategories(group: CategoryWithChildren) {
  return group.categories.filter((category) => category.is_active);
}

function groupBudget(group: CategoryWithChildren, daysInMonth: number, currentDay: number) {
  const categories = activeCategories(group);
  if (!categories.length) {
    return {
      limit: adjustedMonthlyLimit(group.average_monthly_budget, daysInMonth, group.budget_period),
      plan: plannedUntilCurrentDay(group.average_monthly_budget, currentDay, group.budget_period)
    };
  }
  return {
    limit: categories.reduce((sum, category) => sum + adjustedMonthlyLimit(category.average_monthly_budget, daysInMonth, category.budget_period), 0),
    plan: categories.reduce((sum, category) => sum + plannedUntilCurrentDay(category.average_monthly_budget, currentDay, category.budget_period), 0)
  };
}

function spentFor(transactions: Transaction[], categoryId?: string) {
  return transactions
    .filter((transaction) => transaction.type === "expense" && (!categoryId || transaction.category_id === categoryId))
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
}

export function BudgetCard({ group, transactions, daysInMonth, currentDay, expanded = false, onClick, overrideSpent }: Props) {
  const spent = overrideSpent ?? spentFor(transactions);
  const budget = groupBudget(group, daysInMonth, currentDay);
  const spentForBar = Math.max(0, spent);
  const spentPercent = budget.limit > 0 ? Math.min(120, (spentForBar / budget.limit) * 100) : 0;
  const planPercent = budget.limit > 0 ? Math.min(100, (budget.plan / budget.limit) * 100) : 0;
  const planUsagePercent = budget.plan > 0 ? Math.round((spent / budget.plan) * 100) : 0;
  const isOverPlan = planUsagePercent > 100;

  return (
    <article className={`budget-card ${expanded ? "expanded" : ""}`} style={{ ["--accent" as string]: categoryAccent(group.name, group.color) }}>
      <button className="budget-main" onClick={onClick} type="button">
        <div className="budget-card-header compact-budget-head start-budget-head">
          <p className="card-title start-card-title">
            <span className="card-name">{group.name}</span>
            <span className={isOverPlan ? "plan-percent over" : "plan-percent"}>{planUsagePercent}%</span>
          </p>
          <strong>{formatEuro(spent)} / {formatEuro(budget.plan)}</strong>
        </div>

        <div className="budget-bar" aria-label={`${group.name} Budgetfortschritt`}>
          <div className="budget-fill" style={{ width: `${spentPercent}%` }} />
          <div className="budget-marker" style={{ left: `${planPercent}%` }} />
        </div>
      </button>

      {expanded && activeCategories(group).length > 0 && (
        <div className="subcategory-panel">
          {activeCategories(group).map((category) => {
            const categorySpent = spentFor(transactions, category.id);
            const limit = adjustedMonthlyLimit(category.average_monthly_budget, daysInMonth, category.budget_period);
            const plan = plannedUntilCurrentDay(category.average_monthly_budget, currentDay, category.budget_period);
            const percent = limit > 0 ? Math.min(120, (Math.max(0, categorySpent) / limit) * 100) : 0;
            const planPercentInner = limit > 0 ? Math.min(100, (plan / limit) * 100) : 0;
            return (
              <div className="subcategory-row" key={category.id}>
                <div className="subcategory-head">
                  <span>{category.name}</span>
                  <b>{formatEuro(categorySpent)} / {formatEuro(plan)}</b>
                </div>
                <div className="mini-bar">
                  <div style={{ width: `${percent}%` }} />
                  <i style={{ left: `${planPercentInner}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
