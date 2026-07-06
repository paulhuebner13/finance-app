"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { BookingModal } from "@/components/BookingModal";
import { formatEuro, getMonthRange, monthKey } from "@/lib/date";
import { applyDeltas, entryTypeLabel, invertDeltas, transactionDeltas } from "@/lib/finance";
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
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const range = getMonthRange(month);
    const [txRes, groupRes, categoryRes, accountRes] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", session.user.id).gte("date", range.start).lte("date", range.end).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("category_groups").select("*").eq("user_id", session.user.id).order("sort_order"),
      supabase.from("categories").select("*").eq("user_id", session.user.id).order("sort_order"),
      supabase.from("accounts").select("*").eq("user_id", session.user.id).order("created_at")
    ]);
    const categoryRows = (categoryRes.data ?? []) as Category[];
    const groupRows = (groupRes.data ?? []) as CategoryGroup[];
    setTransactions((txRes.data ?? []) as Transaction[]);
    setCategories(categoryRows);
    setGroups(groupRows.map((group) => ({ ...group, categories: categoryRows.filter((category) => category.group_id === group.id) })));
    setAccounts((accountRes.data ?? []) as Account[]);
  }, [month, session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return transactions;
    return transactions.filter((tx) => tx.type === filter);
  }, [transactions, filter]);

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
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  const totals = useMemo(() => ({
    expenses: filtered.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount), 0),
    income: filtered.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount), 0),
    investments: filtered.filter((tx) => tx.type === "investment").reduce((sum, tx) => sum + Number(tx.amount), 0),
    all: filtered.reduce((sum, tx) => sum + Number(tx.amount), 0)
  }), [filtered]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="hero-card compact">
          <p className="eyebrow">Buchungen</p>
          <h1>{formatEuro(filter === "expense" ? totals.expenses : filter === "income" ? totals.income : filter === "investment" ? totals.investments : totals.all)}</h1>
          <p className="muted">Bearbeiten oder löschen. Kontostände werden dabei mitkorrigiert.</p>
        </section>

        <section className="filters-card">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Alle</option>
            <option value="expense">Ausgaben</option>
            <option value="income">Einnahmen</option>
            <option value="transfer">Umbuchungen</option>
            <option value="investment">Investieren</option>
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
              <div className={`tx-row tx-${tx.type}`} key={tx.id}>
                <div>
                  <strong>{tx.note || category?.name || group?.name || entryTypeLabel(tx.type)}</strong>
                  <span>{tx.date} · {entryTypeLabel(tx.type)} · {tx.type === "transfer" || tx.type === "investment" ? `${from?.name ?? "?"} → ${to?.name ?? "?"}` : `${group?.name ?? ""}${category ? ` / ${category.name}` : ""} · ${account?.name ?? ""}`}</span>
                </div>
                <div className="tx-actions">
                  <b>{tx.type === "income" ? "+" : tx.type === "expense" || tx.type === "investment" ? "-" : ""}{formatEuro(Number(tx.amount))}</b>
                  <button className="mini-button" onClick={() => setEditing(tx)}>Bearbeiten</button>
                  <button className="mini-button danger" onClick={() => deleteTransaction(tx)}>Löschen</button>
                </div>
              </div>
            );
          })}
          {!filtered.length && <p className="muted center">Keine Buchungen für diese Auswahl.</p>}
        </section>
      </main>

      <BookingModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={load}
        userId={session.user.id}
        accounts={accounts}
        groups={groups}
        transaction={editing}
      />
    </AppShell>
  );
}
