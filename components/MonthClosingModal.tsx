"use client";

import { useEffect, useState } from "react";
import { formatMonthTitle } from "@/lib/date";
import { depotTax, parseAmount } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Debt } from "@/lib/types";

type Props = {
  open: boolean;
  month: string;
  userId: string;
  accounts: Account[];
  debts: Debt[];
  onClose: () => void;
  onSaved: () => void;
};

export function MonthClosingModal({ open, month, userId, accounts, debts, onClose, onSaved }: Props) {
  const [accountValues, setAccountValues] = useState<Record<string, string>>({});
  const [debtValues, setDebtValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAccountValues(Object.fromEntries(accounts.filter((a) => a.is_active).map((a) => [a.id, String(Number(a.balance)).replace(".", ",")] )));
    setDebtValues(Object.fromEntries(debts.filter((d) => d.is_active).map((d) => [d.id, String(Number(d.amount)).replace(".", ",")] )));
    setError("");
  }, [open, accounts, debts]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const { data: closing, error: closingError } = await supabase
        .from("month_closings")
        .insert({ user_id: userId, month })
        .select("id")
        .single();
      if (closingError) throw closingError;

      const activeAccounts = accounts.filter((a) => a.is_active);
      await supabase.from("month_closing_balances").insert(activeAccounts.map((account) => ({
        closing_id: closing.id,
        account_id: account.id,
        actual_balance: parseAmount(accountValues[account.id] ?? "0")
      })));

      for (const account of activeAccounts) {
        const actual = parseAmount(accountValues[account.id] ?? "0");
        const { error: accountError } = await supabase
          .from("accounts")
          .update(account.type === "investment" ? { balance: actual, tax_reserve: depotTax(actual, Number(account.cost_basis ?? 0)) } : { balance: actual })
          .eq("id", account.id)
          .eq("user_id", userId);
        if (accountError) throw accountError;
      }

      const activeDebts = debts.filter((d) => d.is_active);
      if (activeDebts.length) {
        await supabase.from("month_closing_debts").insert(activeDebts.map((debt) => ({
          closing_id: closing.id,
          debt_id: debt.id,
          actual_amount: parseAmount(debtValues[debt.id] ?? "0")
        })));

        for (const debt of activeDebts) {
          const actual = parseAmount(debtValues[debt.id] ?? "0");
          const { error: debtError } = await supabase
            .from("debts")
            .update({ amount: actual })
            .eq("id", debt.id)
            .eq("user_id", userId);
          if (debtError) throw debtError;
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="closing-modal">
        <div className="modal-header">
          <h2>{formatMonthTitle(month)}</h2>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>

        <div className="cards-stack">
          {accounts.filter((a) => a.is_active).map((account) => (
            <label key={account.id}>
              {account.name}
              <input inputMode="decimal" value={accountValues[account.id] ?? ""} onChange={(e) => setAccountValues((old) => ({ ...old, [account.id]: e.target.value }))} />
            </label>
          ))}

          {debts.filter((d) => d.is_active).map((debt) => (
            <label key={debt.id}>
              {debt.kind === "i_owe" ? "Schuld" : "Offen"}: {debt.person}
              <input inputMode="decimal" value={debtValues[debt.id] ?? ""} onChange={(e) => setDebtValues((old) => ({ ...old, [debt.id]: e.target.value }))} />
            </label>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={save} disabled={saving}>{saving ? "Speichern..." : "Speichern"}</button>
      </section>
    </div>
  );
}
