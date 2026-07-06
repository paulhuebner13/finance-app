"use client";

import { useEffect, useState } from "react";
import { formatEuro, formatMonthTitle } from "@/lib/date";
import { parseAmount } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account } from "@/lib/types";

type Props = {
  open: boolean;
  month: string;
  userId: string;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
};

export function MonthClosingModal({ open, month, userId, accounts, onClose, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(accounts.filter((a) => a.is_active).map((a) => [a.id, String(Number(a.balance)).replace(".", ",")])));
    setError("");
  }, [open, accounts]);

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
        actual_balance: parseAmount(values[account.id] ?? "0")
      })));

      for (const account of activeAccounts) {
        const actual = parseAmount(values[account.id] ?? "0");
        const { error: accountError } = await supabase
          .from("accounts")
          .update({ balance: actual })
          .eq("id", account.id)
          .eq("user_id", userId);
        if (accountError) throw accountError;
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
          <div>
            
            <h2>{formatMonthTitle(month)}</h2>
            
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>

        <div className="cards-stack">
          {accounts.filter((a) => a.is_active).map((account) => (
            <label key={account.id}>
              {account.name}
              <input inputMode="decimal" value={values[account.id] ?? ""} onChange={(e) => setValues((old) => ({ ...old, [account.id]: e.target.value }))} />
            </label>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={save} disabled={saving}>{saving ? "Speichern..." : "Speichern"}</button>
      </section>
    </div>
  );
}
