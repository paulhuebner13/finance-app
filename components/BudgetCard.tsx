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
  const totalLimit = Math.max(0, budget.limit);
  const plannedLimit = Math.max(0, budget.plan);
  const barScale = Math.max(plannedLimit, totalLimit, spentForBar, 1);
  const spentPercent = Math.min(100, (spentForBar / barScale) * 100);
  const planPercent = Math.min(100, (plannedLimit / barScale) * 100);
  const totalPercent = Math.min(100, (totalLimit / barScale) * 100);
  const planUsagePercent = plannedLimit > 0 ? Math.round((spent / plannedLimit) * 100) : 0;
  const isOverPlan = planUsagePercent > 100;
  const isOverTotal = totalLimit > 0 && spentForBar > totalLimit;

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

        <div className={`budget-bar ${isOverPlan ? "over-plan" : ""} ${isOverTotal ? "over-total" : ""}`} aria-label={`${group.name} Budgetfortschritt`}>
          <div className="budget-fill" style={{ width: `${spentPercent}%` }} />
          <div className="budget-marker plan-marker" style={{ left: `${planPercent}%` }} title="Planstand" />
          {totalLimit > 0 && totalPercent < 99.5 && <div className="budget-marker total-marker" style={{ left: `${totalPercent}%` }} title="Monatsbudget" />}
        </div>
      </button>

      {expanded && activeCategories(group).length > 0 && (
        <div className="subcategory-panel">
          {activeCategories(group).map((category) => {
            const categorySpent = spentFor(transactions, category.id);
            const limit = adjustedMonthlyLimit(category.average_monthly_budget, daysInMonth, category.budget_period);
            const plan = plannedUntilCurrentDay(category.average_monthly_budget, currentDay, category.budget_period);
            const subSpent = Math.max(0, categorySpent);
            const subScale = Math.max(limit, plan, subSpent, 1);
            const percent = Math.min(100, (subSpent / subScale) * 100);
            const planPercentInner = Math.min(100, (Math.max(0, plan) / subScale) * 100);
            const subLimitPercent = Math.min(100, (Math.max(0, limit) / subScale) * 100);
            const subOverTotal = limit > 0 && subSpent > limit;
            return (
              <div className="subcategory-row" key={category.id}>
                <div className="subcategory-head">
                  <span>{category.name}</span>
                  <b>{formatEuro(categorySpent)} / {formatEuro(plan)}</b>
                </div>
                <div className={`mini-bar ${subOverTotal ? "over-total" : ""}`}>
                  <div style={{ width: `${percent}%` }} />
                  <i className="plan-marker" style={{ left: `${planPercentInner}%` }} />
                  {limit > 0 && subLimitPercent < 99.5 && <i className="total-marker" style={{ left: `${subLimitPercent}%` }} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
