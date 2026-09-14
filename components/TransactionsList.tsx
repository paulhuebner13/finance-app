"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { BookingModal } from "@/components/BookingModal";
import { formatEuro, getMonthRange, monthKey } from "@/lib/date";
import { applyDeltas, entryTypeLabelForTransaction, formatTransactionAmount, invertDeltas, sortAccountsStable, transactionDeltas, transactionTone } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Category, CategoryGroup, CategoryWithChildren, Transaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function TransactionsList() {
  const { session, loading } = useSession();
  const [month, setMonth] = useState(monthKey());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<CategoryWithChildren[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const range = getMonthRange(month);
    const [txRes, groupRes, categoryRes, accountRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", session.user.id).gte("date", range.start).lte("date", range.end).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("category_groups").select("*").eq("user_id", session.user.id).order("sort_order"),
      supabase.from("categories").select("*").eq("user_id", session.user.id).order("sort_order"),
      supabase.from("accounts").select("*").eq("user_id", session.user.id).eq("is_active", true).order("created_at")
    ]);
    const categoryRows = (categoryRes.data ?? []) as Category[];
    const groupRows = (groupRes.data ?? []) as CategoryGroup[];
    setTransactions((txRes.data ?? []) as Transaction[]);
    setCategories(categoryRows);
    setGroups(groupRows.map((group) => ({ ...group, categories: categoryRows.filter((category) => category.group_id === group.id) })));
    setAccounts(sortAccountsStable((accountRes.data ?? []) as Account[]));
  }, [month, session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const filterGroups = useMemo(() => {
    if (filter === "transfer") return [];
    if (filter === "all") return groups;
    return groups.filter((group) => group.kind === filter);
  }, [groups, filter]);

  const selectedGroup = useMemo(() => groups.find((group) => group.id === groupFilter) ?? null, [groups, groupFilter]);
  const filterCategories = useMemo(() => selectedGroup?.categories ?? [], [selectedGroup]);

  useEffect(() => {
    if (groupFilter === "all") {
      if (categoryFilter !== "all") setCategoryFilter("all");
      return;
    }
    const stillAvailable = filterGroups.some((group) => group.id === groupFilter);
    if (!stillAvailable) {
      setGroupFilter("all");
      setCategoryFilter("all");
      return;
    }
    if (categoryFilter !== "all" && !filterCategories.some((category) => category.id === categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, filterCategories, filterGroups, groupFilter]);

  const filtered = useMemo(() => transactions.filter((tx) => {
    if (filter !== "all" && tx.type !== filter) return false;
    if (groupFilter !== "all" && tx.group_id !== groupFilter) return false;
    if (categoryFilter !== "all" && tx.category_id !== categoryFilter) return false;
    return true;
  }), [transactions, filter, groupFilter, categoryFilter]);

  async function deleteTransaction(tx: Transaction) {
    if (!session?.user.id) return;
    const ok = window.confirm("Diese Buchung wirklich löschen? Der Kontostand wird automatisch zurückgerechnet.");
    if (!ok) return;
    setError("");
    try {
      const { error: deleteError } = await supabase.from("transactions").delete().eq("id", tx.id).eq("user_id", session.user.id);
      if (deleteError) throw deleteError;
      await applyDeltas(session.user.id, accounts, invertDeltas(transactionDeltas(tx)));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "löschen fehlgeschlagen.");
    }
  }

  const totals = useMemo(() => ({
    expenses: transactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount), 0),
    income: transactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount), 0),
    investments: transactions.filter((tx) => tx.type === "investment").reduce((sum, tx) => sum + Number(tx.amount), 0),
    all: transactions.reduce((sum, tx) => sum + Number(tx.amount), 0)
  }), [transactions]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="transaction-totals-card">
          <div className="transaction-total expense-total">
            <span>Ausgaben</span>
            <strong>{formatEuro(totals.expenses)}</strong>
          </div>
          <div className="transaction-total income-total">
            <span>Einnahmen</span>
            <strong>{formatEuro(totals.income)}</strong>
          </div>
        </section>

        <section className="filters-card transaction-filter-card">
          <input className="filter-compact" type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Monat" />
          <select className="filter-compact" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Typ">
            <option value="all">Alle Typen</option>
            <option value="expense">Ausgaben</option>
            <option value="income">Einnahmen</option>
            <option value="transfer">Umbuchungen</option>
            <option value="investment">Investieren</option>
          </select>
          <select
            className="filter-compact"
            value={groupFilter}
            onChange={(e) => { setGroupFilter(e.target.value); setCategoryFilter("all"); }}
            aria-label="Kategorie"
          >
            <option value="all">Alle Kategorien</option>
            {filterGroups.map((group) => (
              <option value={group.id} key={group.id}>{group.name}</option>
            ))}
          </select>
          <select
            className="filter-compact"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            disabled={groupFilter === "all" || filterCategories.length === 0}
            aria-label="Unterkategorie"
          >
            <option value="all">Alle Unterkat.</option>
            {filterCategories.map((category) => (
              <option value={category.id} key={category.id}>{category.name}</option>
            ))}
          </select>
        </section>

        {error && <p className="error">{error}</p>}

        <section className="list-card">
          {filtered.map((tx) => {
            const group = groups.find((g) => g.id === tx.group_id);
            const category = categories.find((c) => c.id === tx.category_id);
            const account = accounts.find((a) => a.id === tx.account_id);
            const from = accounts.find((a) => a.id === tx.from_account_id);
            const to = accounts.find((a) => a.id === tx.to_account_id);
            return (
              <article className={`transaction-card tx-${transactionTone(tx)}`} key={tx.id}>
                <div className="transaction-main">
                  <strong>{tx.note || category?.name || group?.name || entryTypeLabelForTransaction(tx)}</strong>
                  <span>{tx.date} · {entryTypeLabelForTransaction(tx)} · {tx.type === "transfer" || tx.type === "investment" ? `${from?.name ?? "?"} → ${to?.name ?? "?"}` : `${group?.name ?? ""}${category ? ` / ${category.name}` : ""} · ${account?.name ?? ""}`}</span>
                </div>
                <div className="tx-actions">
                  <b>{formatTransactionAmount(tx, formatEuro)}</b>
                  <button className="mini-button" onClick={() => setEditing(tx)}>bearbeiten</button>
                  <button className="mini-button danger" onClick={() => deleteTransaction(tx)}>löschen</button>
                </div>
              </article>
            );
          })}
          {!filtered.length && <p className="muted center">Keine Buchungen.</p>}
        </section>
      </main>

      <button className="floating-booking-button" onClick={() => setBookingOpen(true)}>+ Buchung</button>

      <BookingModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={load}
        userId={session.user.id}
        accounts={accounts}
        groups={groups}
        transaction={editing}
      />

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        onSaved={load}
        userId={session.user.id}
        accounts={accounts}
        groups={groups}
      />
    </AppShell>
  );
}
