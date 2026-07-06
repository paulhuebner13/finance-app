"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatEuro, todayISO } from "@/lib/date";
import { applyDeltas, invertDeltas, mergeDeltas, parseAmount, transactionDeltas } from "@/lib/finance";
import type { Account, CategoryWithChildren, EntryType, Transaction } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  accounts: Account[];
  groups: CategoryWithChildren[];
  transaction?: Transaction | null;
};

const cycle: EntryType[] = ["expense", "income", "transfer", "investment"];
const labels: Record<EntryType, string> = {
  expense: "Ausgabe",
  income: "Einnahme",
  transfer: "Umbuchung",
  investment: "Investition"
};

export function BookingModal({ open, onClose, onSaved, userId, accounts, groups, transaction }: Props) {
  const [type, setType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [groupId, setGroupId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = Boolean(transaction?.id);
  const activeAccounts = accounts.filter((a) => a.is_active);
  const paymentAccounts = activeAccounts.filter((a) => a.type !== "investment");
  const investmentAccounts = activeAccounts.filter((a) => a.type === "investment");
  const defaultAccount = activeAccounts.find((a) => a.is_default) ?? activeAccounts.find((a) => a.type === "active") ?? activeAccounts[0];
  const defaultPaymentAccount = paymentAccounts.find((a) => a.is_default) ?? paymentAccounts.find((a) => a.type === "active") ?? paymentAccounts[0];
  const defaultInvestmentAccount = investmentAccounts[0];

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setType(transaction.type);
      setAmount(String(Number(transaction.amount)).replace(".", ","));
      setDate(transaction.date);
      setGroupId(transaction.group_id ?? "");
      setCategoryId(transaction.category_id ?? "");
      setAccountId(transaction.account_id ?? "");
      setFromAccountId(transaction.from_account_id ?? "");
      setToAccountId(transaction.to_account_id ?? "");
      setNote(transaction.note ?? "");
    } else {
      setType("expense");
      setAmount("");
      setDate(todayISO());
      setGroupId("");
      setCategoryId("");
      setAccountId(defaultAccount?.id ?? "");
      setFromAccountId("");
      setToAccountId("");
      setNote("");
    }
    setError("");
  }, [open, transaction, defaultAccount?.id]);

  const relevantGroups = useMemo(() => {
    if (type === "expense") return groups.filter((g) => g.kind === "expense");
    if (type === "income") return groups.filter((g) => g.kind === "income");
    if (type === "investment") return groups.filter((g) => g.kind === "investment");
    return [];
  }, [groups, type]);

  const selectedGroup = groups.find((g) => g.id === groupId);
  const selectedCategories = selectedGroup?.categories ?? [];
  function applyDefaultAccounts(nextType: EntryType) {
    if (nextType === "expense" || nextType === "income") {
      setAccountId(defaultAccount?.id ?? "");
      setFromAccountId("");
      setToAccountId("");
    }
    if (nextType === "transfer") {
      setAccountId("");
      setFromAccountId(defaultAccount?.id ?? "");
      setToAccountId("");
    }
    if (nextType === "investment") {
      setAccountId("");
      setFromAccountId(defaultPaymentAccount?.id ?? "");
      setToAccountId(defaultInvestmentAccount?.id ?? "");
    }
  }

  function nextType() {
    const index = cycle.indexOf(type);
    const next = cycle[(index + 1) % cycle.length];
    setType(next);
    setGroupId("");
    setCategoryId("");
    applyDefaultAccounts(next);
    setError("");
  }

  function finalCategory() {
    if (type === "transfer") return null;
    if (categoryId) return categoryId;
    return selectedCategories.find((c) => c.name.toLowerCase() === "sonstiges")?.id ?? selectedCategories[0]?.id ?? null;
  }

  function validate(numericAmount: number) {
    if (!numericAmount || numericAmount <= 0) return "Bitte Betrag eingeben.";
    if (type === "transfer" && (!fromAccountId || !toAccountId || fromAccountId === toAccountId)) return "Bitte zwei unterschiedliche Konten auswählen.";
    if (type === "investment" && (!groupId || !fromAccountId || !toAccountId || fromAccountId === toAccountId)) return "Bitte Kategorie, Zahlungskonto und Investmentkonto auswählen.";
    if ((type === "expense" || type === "income") && (!groupId || !accountId)) return "Bitte Kategorie und Konto auswählen.";
    return "";
  }

  async function save() {
    setError("");
    const numericAmount = parseAmount(amount);
    const validation = validate(numericAmount);
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        user_id: userId,
        type,
        amount: numericAmount,
        date,
        account_id: type === "expense" || type === "income" ? accountId : null,
        from_account_id: type === "transfer" || type === "investment" ? fromAccountId : null,
        to_account_id: type === "transfer" || type === "investment" ? toAccountId : null,
        group_id: type === "transfer" ? null : groupId,
        category_id: type === "transfer" ? null : finalCategory(),
        note: note.trim() || null
      };

      if (transaction) {
        const nextTx = { ...transaction, ...payload } as Transaction;
        const deltas = mergeDeltas(invertDeltas(transactionDeltas(transaction)), transactionDeltas(nextTx));
        const { error: updateError } = await supabase.from("transactions").update(payload).eq("id", transaction.id).eq("user_id", userId);
        if (updateError) throw updateError;
        await applyDeltas(userId, accounts, deltas);
      } else {
        const { error: insertError } = await supabase.from("transactions").insert(payload);
        if (insertError) throw insertError;
        await applyDeltas(userId, accounts, transactionDeltas(payload));
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className={`booking-modal booking-${type}`}>
        <div className="modal-header">
          <div>
            <button className="type-pill" onClick={nextType}>{labels[type]}</button>
            <p className="muted small modal-subtitle">{isEditing ? "Buchung bearbeiten" : "Neue Buchung"}</p>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>

        <label className="amount-label">
          Betrag
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus />
          {parseAmount(amount) > 0 && <small>{formatEuro(parseAmount(amount))}</small>}
        </label>

        {type === "transfer" ? (
          <div className="grid-2">
            <label>
              Von Konto
              <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                <option value="">Auswählen</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <label>
              Nach Konto
              <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Auswählen</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          </div>
        ) : type === "investment" ? (
          <>
            <div className="grid-2">
              <label>
                Von Konto
                <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                  <option value="">Auswählen</option>
                  {paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label>
                Investmentkonto
                <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  <option value="">Auswählen</option>
                  {investmentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
            </div>
            <label>
              Investment-Kategorie
              <select value={groupId} onChange={(e) => { setGroupId(e.target.value); setCategoryId(""); }}>
                <option value="">Auswählen</option>
                {relevantGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label>
              Unterkategorie
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!groupId}>
                <option value="">Sonstiges/automatisch</option>
                {selectedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              Kategorie
              <select value={groupId} onChange={(e) => { setGroupId(e.target.value); setCategoryId(""); }}>
                <option value="">Auswählen</option>
                {relevantGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>

            <label>
              Unterkategorie
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!groupId}>
                <option value="">Sonstiges/automatisch</option>
                {selectedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>

            <label>
              Konto
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Auswählen</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          </>
        )}

        <label>
          Datum
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label>
          Notiz optional
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Billa, Kino, Miete, ETF Sparplan..." rows={3} />
        </label>

        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={save} disabled={saving}>{saving ? "Speichern..." : isEditing ? "Änderung speichern" : "Speichern"}</button>
      </section>
    </div>
  );
}
