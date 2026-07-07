"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, formatNumber } from "@/lib/date";
import { entryTypeLabel, parseAmount, sortAccountsStable } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Category, CategoryGroup, CategoryWithChildren, EntryType, RecurringTransaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

type RuleForm = {
  type: EntryType;
  amount: string;
  day: string;
  accountId: string;
  fromAccountId: string;
  toAccountId: string;
  groupId: string;
  categoryId: string;
  note: string;
};

const emptyForm: RuleForm = {
  type: "expense",
  amount: "",
  day: "1",
  accountId: "",
  fromAccountId: "",
  toAccountId: "",
  groupId: "",
  categoryId: "",
  note: ""
};

function formFromItem(item: RecurringTransaction): RuleForm {
  return {
    type: item.type,
    amount: formatNumber(Number(item.amount)),
    day: String(item.day_of_month),
    accountId: item.account_id ?? "",
    fromAccountId: item.from_account_id ?? "",
    toAccountId: item.to_account_id ?? "",
    groupId: item.group_id ?? "",
    categoryId: item.category_id ?? "",
    note: item.note ?? ""
  };
}

function typeClass(type: EntryType) {
  if (type === "income") return "rule-income";
  if (type === "expense") return "rule-expense";
  if (type === "transfer") return "rule-transfer";
  return "rule-investment";
}

function RuleFields({
  form,
  setForm,
  accounts,
  groups
}: {
  form: RuleForm;
  setForm: (patch: Partial<RuleForm>) => void;
  accounts: Account[];
  groups: CategoryWithChildren[];
}) {
  const relevantGroups = useMemo(() => {
    if (form.type === "expense") return groups.filter((g) => g.kind === "expense");
    if (form.type === "income") return groups.filter((g) => g.kind === "income");
    if (form.type === "investment") return groups.filter((g) => g.kind === "investment");
    return [];
  }, [groups, form.type]);
  const selectedGroup = groups.find((g) => g.id === form.groupId);
  const categories = selectedGroup?.categories ?? [];
  const paymentAccounts = accounts.filter((a) => a.is_active && a.type !== "investment");
  const investmentAccounts = accounts.filter((a) => a.is_active && a.type === "investment");

  return (
    <>
      <div className="grid-2">
        <label>Typ
          <select value={form.type} onChange={(e) => setForm({ type: e.target.value as EntryType, groupId: "", categoryId: "" })}>
            <option value="expense">Ausgabe</option>
            <option value="income">Einnahme</option>
            <option value="transfer">Umbuchung</option>
            <option value="investment">Investition</option>
          </select>
        </label>
        <label>Tag
          <input inputMode="numeric" value={form.day} onChange={(e) => setForm({ day: e.target.value })} />
        </label>
      </div>
      <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ amount: e.target.value })} placeholder="Betrag" />

      {form.type === "transfer" ? (
        <div className="grid-2">
          <label>Von<select value={form.fromAccountId} onChange={(e) => setForm({ fromAccountId: e.target.value })}><option value="">Auswählen</option>{accounts.filter((a) => a.is_active).map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
          <label>Nach<select value={form.toAccountId} onChange={(e) => setForm({ toAccountId: e.target.value })}><option value="">Auswählen</option>{accounts.filter((a) => a.is_active).map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
        </div>
      ) : form.type === "investment" ? (
        <>
          <div className="grid-2">
            <label>Von<select value={form.fromAccountId} onChange={(e) => setForm({ fromAccountId: e.target.value })}><option value="">Auswählen</option>{paymentAccounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
            <label>Depot<select value={form.toAccountId} onChange={(e) => setForm({ toAccountId: e.target.value })}><option value="">Auswählen</option>{investmentAccounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
          </div>
          <label>Kategorie<select value={form.groupId} onChange={(e) => setForm({ groupId: e.target.value, categoryId: "" })}><option value="">Auswählen</option>{relevantGroups.map((g) => <option value={g.id} key={g.id}>{g.name}</option>)}</select></label>
          {!!categories.length && <label>Unterkategorie<select value={form.categoryId} onChange={(e) => setForm({ categoryId: e.target.value })}><option value="">Sonstiges/automatisch</option>{categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}
        </>
      ) : (
        <>
          <label>Konto<select value={form.accountId} onChange={(e) => setForm({ accountId: e.target.value })}><option value="">Auswählen</option>{accounts.filter((a) => a.is_active).map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
          <label>Kategorie<select value={form.groupId} onChange={(e) => setForm({ groupId: e.target.value, categoryId: "" })}><option value="">Auswählen</option>{relevantGroups.map((g) => <option value={g.id} key={g.id}>{g.name}</option>)}</select></label>
          {!!categories.length && <label>Unterkategorie<select value={form.categoryId} onChange={(e) => setForm({ categoryId: e.target.value })}><option value="">Sonstiges/automatisch</option>{categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}
        </>
      )}

      <textarea value={form.note} onChange={(e) => setForm({ note: e.target.value })} placeholder="Notiz" rows={2} />
    </>
  );
}

export function RecurringManager() {
  const { session, loading } = useSession();
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<CategoryWithChildren[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<RuleForm>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<Record<string, RuleForm>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const [itemsRes, accountRes, groupRes, categoryRes] = await Promise.all([
      supabase.from("recurring_transactions").select("*").eq("user_id", session.user.id).order("day_of_month"),
      supabase.from("accounts").select("*").eq("user_id", session.user.id).eq("is_active", true).order("created_at"),
      supabase.from("category_groups").select("*").eq("user_id", session.user.id).order("sort_order"),
      supabase.from("categories").select("*").eq("user_id", session.user.id).order("sort_order")
    ]);
    const categoryRows = (categoryRes.data ?? []) as Category[];
    const groupRows = (groupRes.data ?? []) as CategoryGroup[];
    setItems((itemsRes.data ?? []) as RecurringTransaction[]);
    setAccounts(sortAccountsStable((accountRes.data ?? []) as Account[]));
    setGroups(groupRows.map((group) => ({ ...group, categories: categoryRows.filter((category) => category.group_id === group.id) })));
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  function validateAndPayload(form: RuleForm) {
    const selectedGroup = groups.find((g) => g.id === form.groupId);
    const categories = selectedGroup?.categories ?? [];
    const numericAmount = parseAmount(form.amount);
    const dayNumber = Math.min(31, Math.max(1, Number(form.day) || 1));
    if (!numericAmount || numericAmount <= 0) throw new Error("Betrag fehlt.");
    if ((form.type === "expense" || form.type === "income") && (!form.accountId || !form.groupId)) throw new Error("Konto/Kategorie fehlt.");
    if (form.type === "transfer" && (!form.fromAccountId || !form.toAccountId || form.fromAccountId === form.toAccountId)) throw new Error("Umbuchung braucht zwei Konten.");
    if (form.type === "investment" && (!form.fromAccountId || !form.toAccountId || !form.groupId)) throw new Error("Depot-Regel unvollständig.");
    const finalCategoryId = form.categoryId || categories.find((c) => c.name.toLowerCase() === "sonstiges")?.id || categories[0]?.id || null;
    return {
      type: form.type,
      amount: numericAmount,
      day_of_month: dayNumber,
      account_id: form.type === "expense" || form.type === "income" ? form.accountId : null,
      from_account_id: form.type === "transfer" || form.type === "investment" ? form.fromAccountId : null,
      to_account_id: form.type === "transfer" || form.type === "investment" ? form.toAccountId : null,
      group_id: form.type === "transfer" ? null : form.groupId,
      category_id: form.type === "transfer" ? null : finalCategoryId,
      note: form.note.trim() || null
    };
  }

  async function addRecurring() {
    if (!session?.user.id) return;
    setError("");
    try {
      const payload = validateAndPayload(newForm);
      const { error: insertError } = await supabase.from("recurring_transactions").insert({ ...payload, user_id: session.user.id, active: true });
      if (insertError) throw insertError;
      setNewForm(emptyForm);
      setShowNew(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
  }

  async function saveEdit(item: RecurringTransaction) {
    if (!session?.user.id) return;
    setError("");
    try {
      const payload = validateAndPayload(editForms[item.id] ?? formFromItem(item));
      const { error: updateError } = await supabase.from("recurring_transactions").update(payload).eq("id", item.id).eq("user_id", session.user.id);
      if (updateError) throw updateError;
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
  }

  async function toggle(item: RecurringTransaction) {
    if (!session?.user.id) return;
    await supabase.from("recurring_transactions").update({ active: !item.active }).eq("id", item.id).eq("user_id", session.user.id);
    await load();
  }

  async function remove(item: RecurringTransaction) {
    if (!session?.user.id) return;
    await supabase.from("recurring_transactions").delete().eq("id", item.id).eq("user_id", session.user.id);
    await load();
  }

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard rules-page">
        {!showNew ? (
          <button className="primary" onClick={() => setShowNew(true)}>Neue Regel</button>
        ) : (
          <section className="form-card rule-form-card">
            <RuleFields form={newForm} setForm={(patch) => setNewForm((old) => ({ ...old, ...patch }))} accounts={accounts} groups={groups} />
            {error && <p className="error">{error}</p>}
            <div className="button-row">
              <button className="primary" onClick={addRecurring}>Speichern</button>
              <button className="mini-button" onClick={() => setShowNew(false)}>abbrechen</button>
            </div>
          </section>
        )}

        <section className="cards-stack rules-list">
          {items.map((item) => {
            const group = groups.find((g) => g.id === item.group_id);
            const category = group?.categories.find((c) => c.id === item.category_id);
            const account = accounts.find((a) => a.id === item.account_id);
            const from = accounts.find((a) => a.id === item.from_account_id);
            const to = accounts.find((a) => a.id === item.to_account_id);
            const isEditing = editing === item.id;
            const form = editForms[item.id] ?? formFromItem(item);
            return (
              <article className={`rule-card ${typeClass(item.type)} ${!item.active ? "is-disabled" : ""}`} key={item.id}>
                <div className="rule-summary">
                  <div>
                    <strong>{item.note || category?.name || group?.name || entryTypeLabel(item.type)}</strong>
                    <span>{item.day_of_month}. · {entryTypeLabel(item.type)} · {item.type === "transfer" || item.type === "investment" ? `${from?.name ?? "?"} → ${to?.name ?? "?"}` : `${account?.name ?? "?"}`}</span>
                  </div>
                  <b>{formatEuro(Number(item.amount))}</b>
                </div>

                {isEditing && (
                  <div className="rule-edit-panel">
                    <RuleFields form={form} setForm={(patch) => setEditForms((old) => ({ ...old, [item.id]: { ...form, ...patch } }))} accounts={accounts} groups={groups} />
                    {error && <p className="error">{error}</p>}
                  </div>
                )}

                <div className="button-row">
                  {isEditing ? <button className="mini-button" onClick={() => saveEdit(item)}>speichern</button> : <button className="mini-button" onClick={() => { setEditing(item.id); setEditForms((old) => ({ ...old, [item.id]: formFromItem(item) })); }}>bearbeiten</button>}
                  <button className="mini-button" onClick={() => toggle(item)}>{item.active ? "pausieren" : "aktivieren"}</button>
                  <button className="mini-button danger" onClick={() => remove(item)}>löschen</button>
                </div>
              </article>
            );
          })}
          {!items.length && <p className="muted center">Keine Regeln.</p>}
        </section>
      </main>
    </AppShell>
  );
}
