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
import { applyDeltas, transactionDeltas } from "@/lib/finance";
import { dateForMonthDay, dayOfMonth, daysInMonth, formatEuro, formatMonthTitle, getMonthRange, monthKey, previousMonthKey } from "@/lib/date";
import type { Account, Category, CategoryGroup, CategoryWithChildren, RecurringTransaction, Transaction } from "@/lib/types";

export function FinanceApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<CategoryWithChildren[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [closingOpen, setClosingOpen] = useState(false);
  const currentMonth = monthKey();
  const prevMonth = previousMonthKey();

  const load = useCallback(async (userId: string) => {
    const range = getMonthRange(currentMonth);
    const [accountsRes, groupsRes, categoriesRes, transactionsRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", userId).order("created_at"),
      supabase.from("category_groups").select("*").eq("user_id", userId).eq("is_active", true).order("sort_order"),
      supabase.from("categories").select("*").eq("user_id", userId).eq("is_active", true).order("sort_order"),
      supabase.from("transactions").select("*").eq("user_id", userId).gte("date", range.start).lte("date", range.end).order("date", { ascending: false }).order("created_at", { ascending: false })
    ]);

    if (accountsRes.error || groupsRes.error || categoriesRes.error || transactionsRes.error) {
      console.error(accountsRes.error || groupsRes.error || categoriesRes.error || transactionsRes.error);
      return;
    }

    const categoryRows = (categoriesRes.data ?? []) as Category[];
    const groupRows = (groupsRes.data ?? []) as CategoryGroup[];
    setAccounts((accountsRes.data ?? []) as Account[]);
    setGroups(groupRows.map((group) => ({ ...group, categories: categoryRows.filter((category) => category.group_id === group.id) })));
    setTransactions((transactionsRes.data ?? []) as Transaction[]);
  }, [currentMonth]);

  const setupDefaults = useCallback(async (userId: string) => {
    setBootstrapping(true);
    const { data: existingAccounts } = await supabase.from("accounts").select("id").eq("user_id", userId).limit(1);
    if (!existingAccounts?.length) {
      await supabase.from("accounts").insert(defaultAccounts.map((account) => ({ ...account, user_id: userId })));
    }

    const { data: existingGroups } = await supabase.from("category_groups").select("id").eq("user_id", userId).limit(1);
    if (!existingGroups?.length) {
      for (const [index, group] of defaultCategoryGroups.entries()) {
        const { data: insertedGroup, error } = await supabase
          .from("category_groups")
          .insert({
            user_id: userId,
            kind: group.kind,
            name: group.name,
            average_monthly_budget: group.average_monthly_budget,
            color: group.color,
            sort_order: index
          })
          .select("id")
          .single();

        if (error || !insertedGroup) continue;

        await supabase.from("categories").insert(group.categories.map((name, categoryIndex) => ({
          user_id: userId,
          group_id: insertedGroup.id,
          name,
          sort_order: categoryIndex
        })));
      }
    }
    setBootstrapping(false);
  }, []);

  const applyRecurring = useCallback(async (userId: string, currentAccounts: Account[]) => {
    const { data, error } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true);
    if (error) return;

    const recurring = (data ?? []) as RecurringTransaction[];
    for (const item of recurring) {
      if (item.last_created_month === currentMonth) continue;
      const payload = {
        user_id: userId,
        type: item.type,
        amount: Number(item.amount),
        date: dateForMonthDay(currentMonth, item.day_of_month),
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
        const { data: accountRows } = await supabase.from("accounts").select("*").eq("user_id", data.session.user.id).order("created_at");
        const currentAccounts = (accountRows ?? []) as Account[];
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
  }, [load, setupDefaults, applyRecurring, checkMonthClosing]);

  const stats = useMemo(() => {
    const expenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);
    const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0);
    const investments = transactions.filter((t) => t.type === "investment").reduce((sum, t) => sum + Number(t.amount), 0);
    const available = accounts
      .filter((a) => a.is_active && a.include_in_available_net_worth)
      .reduce((sum, a) => sum + Number(a.balance), 0);
    const bound = accounts
      .filter((a) => a.is_active && !a.include_in_available_net_worth && a.type === "bound")
      .reduce((sum, a) => sum + Number(a.balance), 0);
    const depot = accounts
      .filter((a) => a.is_active && a.type === "investment")
      .reduce((sum, a) => sum + Number(a.balance), 0);

    return { expenses, income, investments, available, bound, depot };
  }, [transactions, accounts]);

  const expenseGroups = groups.filter((g) => g.kind === "expense");
  const currentDay = dayOfMonth();
  const monthDays = daysInMonth();

  if (loading || bootstrapping) {
    return <main className="loading-page">Finance App wird geladen...</main>;
  }

  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="month-head">
          <div>
            <h1>{formatMonthTitle(currentMonth)}</h1>
            <p className="muted">{formatEuro(stats.expenses)} Ausgaben · Planstand nach Monatstag</p>
          </div>
          <span className="month-pill">{currentDay}/{monthDays}</span>
        </section>

        <button className="big-add" onClick={() => setBookingOpen(true)}>+ Buchung</button>

        <section>
          <div className="cards-stack">
            {expenseGroups.map((group) => {
              const spent = transactions
                .filter((t) => t.type === "expense" && t.group_id === group.id)
                .reduce((sum, t) => sum + Number(t.amount), 0);
              return <BudgetCard key={group.id} group={group} spent={spent} daysInMonth={monthDays} currentDay={currentDay} />;
            })}
          </div>
        </section>

        <section>
          <div className="section-title">
            <h2>Letzte Buchungen</h2>
          </div>
          <div className="list-card">
            {transactions.slice(0, 8).map((transaction) => {
              const group = groups.find((g) => g.id === transaction.group_id);
              const account = accounts.find((a) => a.id === transaction.account_id || a.id === transaction.from_account_id || a.id === transaction.to_account_id);
              return (
                <div className="list-row" key={transaction.id}>
                  <div>
                    <strong>{transaction.note || group?.name || (transaction.type === "investment" ? "Investition" : "Umbuchung")}</strong>
                    <span>{transaction.date} · {account?.name ?? ""}</span>
                  </div>
                  <b>{transaction.type === "income" ? "+" : transaction.type === "expense" || transaction.type === "investment" ? "-" : ""}{formatEuro(Number(transaction.amount))}</b>
                </div>
              );
            })}
            {!transactions.length && <p className="muted center">Noch keine Buchungen in diesem Monat.</p>}
          </div>
        </section>
      </main>

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
        onClose={() => setClosingOpen(false)}
        onSaved={async () => {
          setClosingOpen(false);
          await load(session.user.id);
        }}
      />
    </AppShell>
  );
}
