"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro } from "@/lib/date";
import { entryTypeLabel, parseAmount } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Category, CategoryGroup, CategoryWithChildren, EntryType, RecurringTransaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function RecurringManager() {
  const { session, loading } = useSession();
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<CategoryWithChildren[]>([]);
  const [type, setType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const [accountId, setAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const [itemsRes, accountRes, groupRes, categoryRes] = await Promise.all([
      supabase.from("recurring_transactions").select("*").eq("user_id", session.user.id).order("day_of_month"),
      supabase.from("accounts").select("*").eq("user_id", session.user.id).order("created_at"),
      supabase.from("category_groups").select("*").eq("user_id", session.user.id).order("sort_order"),
      supabase.from("categories").select("*").eq("user_id", session.user.id).order("sort_order")
    ]);
    const categoryRows = (categoryRes.data ?? []) as Category[];
    const groupRows = (groupRes.data ?? []) as CategoryGroup[];
    setItems((itemsRes.data ?? []) as RecurringTransaction[]);
    setAccounts((accountRes.data ?? []) as Account[]);
    setGroups(groupRows.map((group) => ({ ...group, categories: categoryRows.filter((category) => category.group_id === group.id) })));
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const relevantGroups = useMemo(() => {
    if (type === "expense") return groups.filter((g) => g.kind === "expense");
    if (type === "income") return groups.filter((g) => g.kind === "income");
    if (type === "investment") return groups.filter((g) => g.kind === "investment");
    return [];
  }, [groups, type]);
  const selectedGroup = groups.find((g) => g.id === groupId);
  const categories = selectedGroup?.categories ?? [];
  const paymentAccounts = accounts.filter((a) => a.is_active && a.type !== "investment");
  const investmentAccounts = accounts.filter((a) => a.is_active && a.type === "investment");

  async function addRecurring() {
    if (!session?.user.id) return;
    setError("");
    const numericAmount = parseAmount(amount);
    const dayNumber = Math.min(31, Math.max(1, Number(day) || 1));
    if (!numericAmount || numericAmount <= 0) return setError("Bitte Betrag eingeben.");
    if ((type === "expense" || type === "income") && (!accountId || !groupId)) return setError("Bitte Konto und Kategorie auswählen.");
    if (type === "transfer" && (!fromAccountId || !toAccountId || fromAccountId === toAccountId)) return setError("Bitte zwei unterschiedliche Konten auswählen.");
    if (type === "investment" && (!fromAccountId || !toAccountId || !groupId)) return setError("Bitte Zahlungskonto, Investmentkonto und Kategorie auswählen.");

    const finalCategoryId = categoryId || categories.find((c) => c.name.toLowerCase() === "sonstiges")?.id || categories[0]?.id || null;
    const payload = {
      user_id: session.user.id,
      type,
      amount: numericAmount,
      day_of_month: dayNumber,
      account_id: type === "expense" || type === "income" ? accountId : null,
      from_account_id: type === "transfer" || type === "investment" ? fromAccountId : null,
      to_account_id: type === "transfer" || type === "investment" ? toAccountId : null,
      group_id: type === "transfer" ? null : groupId,
      category_id: type === "transfer" ? null : finalCategoryId,
      note: note.trim() || null,
      active: true
    };
    const { error: insertError } = await supabase.from("recurring_transactions").insert(payload);
    if (insertError) return setError(insertError.message);
    setAmount(""); setNote(""); setGroupId(""); setCategoryId(""); setAccountId(""); setFromAccountId(""); setToAccountId(""); setDay("1"); setType("expense");
    await load();
  }

  async function toggle(item: RecurringTransaction) {
    if (!session?.user.id) return;
    await supabase.from("recurring_transactions").update({ active: !item.active }).eq("id", item.id).eq("user_id", session.user.id);
    await load();
  }

  async function remove(item: RecurringTransaction) {
    if (!session?.user.id) return;
    if (!window.confirm("Regel löschen?")) return;
    await supabase.from("recurring_transactions").delete().eq("id", item.id).eq("user_id", session.user.id);
    await load();
  }

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="form-card">
          <div className="grid-2">
            <label>Typ
              <select value={type} onChange={(e) => { setType(e.target.value as EntryType); setGroupId(""); setCategoryId(""); }}>
                <option value="expense">Ausgabe</option>
                <option value="income">Einnahme</option>
                <option value="transfer">Umbuchung</option>
                <option value="investment">Investition</option>
              </select>
            </label>
            <label>Tag im Monat
              <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
            </label>
          </div>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Betrag" />

          {type === "transfer" ? (
            <div className="grid-2">
              <label>Von Konto<select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}><option value="">Auswählen</option>{accounts.filter((a) => a.is_active).map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
              <label>Nach Konto<select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}><option value="">Auswählen</option>{accounts.filter((a) => a.is_active).map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
            </div>
          ) : type === "investment" ? (
            <>
              <div className="grid-2">
                <label>Von Konto<select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}><option value="">Auswählen</option>{paymentAccounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
                <label>Investmentkonto<select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}><option value="">Auswählen</option>{investmentAccounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
              </div>
              <label>Kategorie<select value={groupId} onChange={(e) => { setGroupId(e.target.value); setCategoryId(""); }}><option value="">Auswählen</option>{relevantGroups.map((g) => <option value={g.id} key={g.id}>{g.name}</option>)}</select></label>
              <label>Unterkategorie<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Sonstiges/automatisch</option>{categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
            </>
          ) : (
            <>
              <label>Konto<select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Auswählen</option>{accounts.filter((a) => a.is_active).map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
              <label>Kategorie<select value={groupId} onChange={(e) => { setGroupId(e.target.value); setCategoryId(""); }}><option value="">Auswählen</option>{relevantGroups.map((g) => <option value={g.id} key={g.id}>{g.name}</option>)}</select></label>
              <label>Unterkategorie<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Sonstiges/automatisch</option>{categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
            </>
          )}

          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz optional" rows={2} />
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={addRecurring}>Speichern</button>
        </section>

        <section className="list-card">
          {items.map((item) => {
            const group = groups.find((g) => g.id === item.group_id);
            const category = group?.categories.find((c) => c.id === item.category_id);
            const account = accounts.find((a) => a.id === item.account_id);
            const from = accounts.find((a) => a.id === item.from_account_id);
            const to = accounts.find((a) => a.id === item.to_account_id);
            return (
              <div className="tx-row" key={item.id}>
                <div>
                  <strong>{item.note || category?.name || group?.name || entryTypeLabel(item.type)}</strong>
                  <span>jeden {item.day_of_month}. · {entryTypeLabel(item.type)} · {item.type === "transfer" || item.type === "investment" ? `${from?.name ?? "?"} → ${to?.name ?? "?"}` : `${account?.name ?? "?"}`}</span>
                  <span>zuletzt: {item.last_created_month || "noch nie"}</span>
                </div>
                <div className="tx-actions">
                  <b>{formatEuro(Number(item.amount))}</b>
                  <button className="mini-button" onClick={() => toggle(item)}>{item.active ? "pausieren" : "aktivieren"}</button>
                  <button className="mini-button danger" onClick={() => remove(item)}>löschen</button>
                </div>
              </div>
            );
          })}
          {!items.length && <p className="muted center">Keine Regeln.</p>}
        </section>
      </main>
    </AppShell>
  );
}
