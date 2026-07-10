"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { BookingModal } from "@/components/BookingModal";
import { BudgetCard } from "@/components/BudgetCard";
import { MonthClosingModal } from "@/components/MonthClosingModal";
import { defaultAccounts, defaultCategoryGroups } from "@/lib/defaults";
import { applyDeltas, debtNetValue, debtValue, invertDeltas, mergeDeltas, sortAccountsStable, transactionDeltas } from "@/lib/finance";
import { dateForMonthDay, dayOfMonth, daysInMonth, formatEuro, getMonthRange, monthKey, plannedUntilCurrentDay, previousMonthKey, todayISO } from "@/lib/date";
import type { Account, Category, CategoryGroup, CategoryWithChildren, Debt, RecurringTransaction, Transaction } from "@/lib/types";

function categoriesBudgetSum(group: CategoryWithChildren) {
  const active = group.categories.filter((category) => category.is_active);
  if (!active.length) return Number(group.average_monthly_budget) || 0;
  return active.reduce((sum, category) => sum + Number(category.average_monthly_budget), 0);
}

function categoriesPlanSum(group: CategoryWithChildren, currentDay: number) {
  const active = group.categories.filter((category) => category.is_active);
  if (!active.length) return plannedUntilCurrentDay(Number(group.average_monthly_budget), currentDay, group.budget_period);
  return active.reduce((sum, category) => sum + plannedUntilCurrentDay(Number(category.average_monthly_budget), currentDay, category.budget_period), 0);
}

function accountCountsForAusgehen(account: Account) {
  return account.type === "active" && account.include_in_available_net_worth;
}

function availableAccountTotal(accounts: Account[]) {
  return accounts
    .filter(accountCountsForAusgehen)
    .reduce((sum, account) => sum + Number(account.balance), 0);
}

export function FinanceApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [openingAvailable, setOpeningAvailable] = useState<number | null>(null);
  const [groups, setGroups] = useState<CategoryWithChildren[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [closingOpen, setClosingOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const currentMonth = monthKey();
  const prevMonth = previousMonthKey();

  const load = useCallback(async (userId: string) => {
    const range = getMonthRange(currentMonth);
    const [accountsRes, debtsRes, groupsRes, categoriesRes, transactionsRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", userId).eq("is_active", true).order("created_at"),
      supabase.from("debts").select("*").eq("user_id", userId).eq("is_active", true).order("created_at"),
      supabase.from("category_groups").select("*").eq("user_id", userId).eq("is_active", true).order("sort_order"),
      supabase.from("categories").select("*").eq("user_id", userId).eq("is_active", true).order("sort_order"),
      supabase.from("transactions").select("*").eq("user_id", userId).gte("date", range.start).lte("date", range.end).order("date", { ascending: false }).order("created_at", { ascending: false })
    ]);

    if (accountsRes.error || debtsRes.error || groupsRes.error || categoriesRes.error || transactionsRes.error) {
      console.error(accountsRes.error || debtsRes.error || groupsRes.error || categoriesRes.error || transactionsRes.error);
      return;
    }

    const categoryRows = (categoriesRes.data ?? []) as Category[];
    const groupRows = (groupsRes.data ?? []) as CategoryGroup[];
    const accountRows = sortAccountsStable((accountsRes.data ?? []) as Account[]);
    const debtRows = (debtsRes.data ?? []) as Debt[];

    const { data: prevClosing } = await supabase
      .from("month_closings")
      .select("id")
      .eq("user_id", userId)
      .eq("month", prevMonth)
      .maybeSingle();

    if (prevClosing?.id) {
      const [closingBalanceRes, closingDebtRes] = await Promise.all([
        supabase
          .from("month_closing_balances")
          .select("account_id, actual_balance")
          .eq("closing_id", prevClosing.id),
        supabase
          .from("month_closing_debts")
          .select("debt_id, actual_amount")
          .eq("closing_id", prevClosing.id)
      ]);
      const openingAccounts = (closingBalanceRes.data ?? []).reduce((sum, balance) => {
        const account = accountRows.find((item) => item.id === balance.account_id);
        if (!account || !accountCountsForAusgehen(account)) return sum;
        return sum + Number(balance.actual_balance);
      }, 0);
      const openingDebts = (closingDebtRes.data ?? []).reduce((sum, item) => {
        const debt = debtRows.find((debtRow) => debtRow.id === item.debt_id);
        if (!debt) return sum;
        return sum + debtValue({ amount: Number(item.actual_amount), kind: debt.kind });
      }, 0);
      setOpeningAvailable(openingAccounts + openingDebts);
    } else {
      setOpeningAvailable(null);
    }

    setAccounts(accountRows);
    setDebts(debtRows);
    setGroups(groupRows.map((group) => ({ ...group, categories: categoryRows.filter((category) => category.group_id === group.id) })));
    setTransactions((transactionsRes.data ?? []) as Transaction[]);
  }, [currentMonth, prevMonth]);

  const setupDefaults = useCallback(async (userId: string) => {
    setBootstrapping(true);
    const { data: existingAccounts } = await supabase.from("accounts").select("id").eq("user_id", userId).limit(1);
    if (!existingAccounts?.length) {
      await supabase.from("accounts").insert(defaultAccounts.map((account) => ({ ...account, user_id: userId })));
    }

    const { data: existingGroups } = await supabase.from("category_groups").select("id").eq("user_id", userId).limit(1);
    if (!existingGroups?.length) {
      for (const [index, group] of defaultCategoryGroups.entries()) {
        const groupBudget = group.categories.length ? group.categories.reduce((sum, category) => sum + Number(category.average_monthly_budget), 0) : group.average_monthly_budget;
        const { data: insertedGroup, error } = await supabase
          .from("category_groups")
          .insert({
            user_id: userId,
            kind: group.kind,
            name: group.name,
            average_monthly_budget: groupBudget,
            budget_period: group.budget_period,
            color: group.color,
            sort_order: index
          })
          .select("id")
          .single();

        if (error || !insertedGroup) continue;

        if (group.categories.length) {
          await supabase.from("categories").insert(group.categories.map((category, categoryIndex) => ({
            user_id: userId,
            group_id: insertedGroup.id,
            name: category.name,
            average_monthly_budget: category.average_monthly_budget,
            budget_period: category.budget_period ?? group.budget_period,
            sort_order: categoryIndex
          })));
        }
      }
    }
    setBootstrapping(false);
  }, []);


  const cleanupPrematureRecurring = useCallback(async (userId: string, currentAccounts: Account[]) => {
    const today = todayISO();
    const currentDay = dayOfMonth();

    const { data: futureRows, error: futureError } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .gt("date", today)
      .ilike("note", "%automatisch%");

    const futureAutomatic = (futureRows ?? []) as Transaction[];

    if (!futureError && futureAutomatic.length) {
      const reverseDeltas = mergeDeltas(
        ...futureAutomatic.map((transaction) => invertDeltas(transactionDeltas(transaction)))
      );
      await applyDeltas(userId, currentAccounts, reverseDeltas);
      await supabase
        .from("transactions")
        .delete()
        .eq("user_id", userId)
        .in("id", futureAutomatic.map((transaction) => transaction.id));
    }

    await supabase
      .from("recurring_transactions")
      .update({ last_created_month: null })
      .eq("user_id", userId)
      .eq("active", true)
      .eq("last_created_month", currentMonth)
      .gt("day_of_month", currentDay);

    return futureAutomatic.length > 0;
  }, [currentMonth]);

  const applyRecurring = useCallback(async (userId: string, currentAccounts: Account[]) => {
    const { data, error } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true);
    if (error) return;

    const recurring = (data ?? []) as RecurringTransaction[];
    const today = todayISO();
    for (const item of recurring) {
      const scheduledDate = dateForMonthDay(currentMonth, item.day_of_month);
      if (item.last_created_month === currentMonth) continue;
      if (scheduledDate > today) continue;
      const payload = {
        user_id: userId,
        type: item.type,
        amount: Number(item.amount),
        date: scheduledDate,
        account_id: item.account_id,
        from_account_id: item.from_account_id,
        to_account_id: item.to_account_id,
        group_id: item.group_id,
        category_id: item.category_id,
        note: item.note ? `${item.note} · automatisch` : "Automatisch"
      };
      const { error: insertError } = await supabase.from("transactions").insert(payload);
      if (insertError) continue;
      await applyDeltas(userId, currentAccounts, transactionDeltas(payload));
      await supabase.from("recurring_transactions").update({ last_created_month: currentMonth }).eq("id", item.id).eq("user_id", userId);
    }
  }, [currentMonth]);

  const checkMonthClosing = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("month_closings")
      .select("id")
      .eq("user_id", userId)
      .eq("month", prevMonth)
      .maybeSingle();
    if (!data?.id) setClosingOpen(true);
  }, [prevMonth]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user.id) {
        await setupDefaults(data.session.user.id);
        const { data: accountRows } = await supabase.from("accounts").select("*").eq("user_id", data.session.user.id).eq("is_active", true).order("created_at");
        let currentAccounts = sortAccountsStable((accountRows ?? []) as Account[]);
        const cleanedPremature = await cleanupPrematureRecurring(data.session.user.id, currentAccounts);
        if (cleanedPremature) {
          const { data: refreshedRows } = await supabase.from("accounts").select("*").eq("user_id", data.session.user.id).eq("is_active", true).order("created_at");
          currentAccounts = sortAccountsStable((refreshedRows ?? []) as Account[]);
        }
        await applyRecurring(data.session.user.id, currentAccounts);
        await load(data.session.user.id);
        await checkMonthClosing(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, [load, setupDefaults, cleanupPrematureRecurring, applyRecurring, checkMonthClosing]);

  const stats = useMemo(() => {
    const expenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);
    const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0);
    const investments = transactions.filter((t) => t.type === "investment").reduce((sum, t) => sum + Number(t.amount), 0);
    const outingGroup = groups.find((g) => g.name.toLowerCase() === "ausgehen");
    const outingTracked = outingGroup ? transactions.filter((t) => t.type === "expense" && t.group_id === outingGroup.id).reduce((sum, t) => sum + Number(t.amount), 0) : 0;
    const trackedExpensesWithoutOuting = expenses - outingTracked;
    const currentComparableValue = availableAccountTotal(accounts) + debtNetValue(debts);
    const outingValue = openingAvailable === null
      ? income - trackedExpensesWithoutOuting - investments
      : openingAvailable + income - investments - trackedExpensesWithoutOuting - currentComparableValue;
    const effectiveExpenses = trackedExpensesWithoutOuting + outingValue;
    return { expenses, income, investments, outingValue, effectiveExpenses };
  }, [transactions, groups, accounts, debts, openingAvailable]);

  const expenseGroups = groups.filter((g) => g.kind === "expense");
  const currentDay = dayOfMonth();
  const monthDays = daysInMonth();
  const plannedExpenses = expenseGroups.reduce((sum, group) => sum + categoriesPlanSum(group, currentDay), 0);
  const plannedExpensePercent = plannedExpenses > 0 ? Math.round((stats.effectiveExpenses / plannedExpenses) * 100) : 0;

  if (loading || bootstrapping) {
    return <main className="loading-page">Laden...</main>;
  }

  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard start-dashboard">
        <section className="start-total-card">
          <span>Ausgaben</span>
          <strong>{formatEuro(stats.effectiveExpenses)} / {formatEuro(plannedExpenses)} · <span className={plannedExpensePercent > 100 ? "plan-percent over" : "plan-percent"}>{plannedExpensePercent}%</span></strong>
        </section>

        <section>
          <div className="cards-stack compact-cards">
            {expenseGroups.map((group) => (
              <BudgetCard
                key={group.id}
                group={{ ...group, average_monthly_budget: categoriesBudgetSum(group) }}
                transactions={transactions.filter((transaction) => transaction.group_id === group.id)}
                daysInMonth={monthDays}
                currentDay={currentDay}
                expanded={selectedGroupId === group.id}
                onClick={() => setSelectedGroupId((current) => current === group.id ? null : group.id)}
                overrideSpent={group.name.toLowerCase() === "ausgehen" ? stats.outingValue : undefined}
              />
            ))}

          </div>
        </section>


      </main>

      <button className="floating-booking-button" onClick={() => setBookingOpen(true)}>+ Buchung</button>

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        onSaved={() => session.user.id && load(session.user.id)}
        userId={session.user.id}
        accounts={accounts}
        groups={groups}
      />

      <MonthClosingModal
        open={closingOpen && accounts.length > 0}
        month={prevMonth}
        userId={session.user.id}
        accounts={accounts}
        debts={debts}
        onClose={() => setClosingOpen(false)}
        onSaved={async () => {
          setClosingOpen(false);
          await load(session.user.id);
        }}
      />
    </AppShell>
  );
}
