"use client";

import { useEffect, useState } from "react";
import { formatEuro, formatMonthTitle, formatNumber } from "@/lib/date";
import { comparableValue, debtValue, depotTax, parseAmount } from "@/lib/finance";
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
  const [debtNetInput, setDebtNetInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAccountValues(Object.fromEntries(accounts.filter((a) => a.is_active).map((a) => [a.id, formatNumber(Number(a.balance))] )));
    const activeDebtNet = debts
      .filter((d) => d.is_active)
      .reduce((sum, debt) => sum + debtValue({ amount: Number(debt.amount), kind: debt.kind }), 0);
    setDebtNetInput(formatNumber(activeDebtNet));
    setError("");
  }, [open, accounts, debts]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const activeAccounts = accounts.filter((a) => a.is_active);
      const activeDebts = debts.filter((d) => d.is_active);
      const closingAccountsForComparable = activeAccounts.map((account) => ({
        type: account.type,
        include_in_available_net_worth: account.include_in_available_net_worth,
        balance: parseAmount(accountValues[account.id] ?? "0")
      }));
      const debtNetValue = parseAmount(debtNetInput);
      const comparableTotal = comparableValue(closingAccountsForComparable, [{ kind: "owed_to_me", amount: debtNetValue }]);

      const { data: closing, error: closingError } = await supabase
        .from("month_closings")
        .insert({ user_id: userId, month, debt_net_value: debtNetValue, comparable_value: comparableTotal })
        .select("id")
        .single();
      if (closingError) throw closingError;
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

      if (activeDebts.length) {
        await supabase.from("month_closing_debts").insert(activeDebts.map((debt) => ({
          closing_id: closing.id,
          debt_id: debt.id,
          actual_amount: Number(debt.amount) || 0
        })));
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  const activeDebts = debts.filter((d) => d.is_active);
  const debtNet = parseAmount(debtNetInput);

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

          <label>
            Schulden
            <input inputMode="decimal" value={debtNetInput} onChange={(e) => setDebtNetInput(e.target.value)} />
          </label>

          <div className="closing-debt-total">
            <span>Schuldenwert</span>
            <strong>{debtNet >= 0 ? "+" : ""}{formatEuro(debtNet)}</strong>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={save} disabled={saving}>{saving ? "Speichern..." : "Speichern"}</button>
      </section>
    </div>
  );
}
