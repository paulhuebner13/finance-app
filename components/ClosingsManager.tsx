"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, formatMonthTitle, formatNumber } from "@/lib/date";
import { parseAmount, sortAccountsStable } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Debt, MonthClosing } from "@/lib/types";
import { useSession } from "@/lib/useSession";

type ClosingBalance = { id: string; closing_id: string; account_id: string; actual_balance: number };
type ClosingDebt = { id: string; closing_id: string; debt_id: string; actual_amount: number };

type ClosingBundle = MonthClosing & {
  balances: ClosingBalance[];
  debtValues: ClosingDebt[];
};

export function ClosingsManager() {
  const { session, loading } = useSession();
  const [closings, setClosings] = useState<ClosingBundle[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const [closingRes, accountRes, debtRes] = await Promise.all([
      supabase.from("month_closings").select("*").eq("user_id", session.user.id).order("month", { ascending: false }),
      supabase.from("accounts").select("*").eq("user_id", session.user.id).order("created_at"),
      supabase.from("debts").select("*").eq("user_id", session.user.id).order("created_at")
    ]);
    const closingRows = (closingRes.data ?? []) as MonthClosing[];
    const ids = closingRows.map((closing) => closing.id);
    let balances: ClosingBalance[] = [];
    let debtValues: ClosingDebt[] = [];
    if (ids.length) {
      const [balanceRes, debtValueRes] = await Promise.all([
        supabase.from("month_closing_balances").select("*").in("closing_id", ids),
        supabase.from("month_closing_debts").select("*").in("closing_id", ids)
      ]);
      balances = (balanceRes.data ?? []) as ClosingBalance[];
      debtValues = (debtValueRes.data ?? []) as ClosingDebt[];
    }
    setAccounts(sortAccountsStable((accountRes.data ?? []) as Account[]));
    setDebts((debtRes.data ?? []) as Debt[]);
    setClosings(closingRows.map((closing) => ({
      ...closing,
      balances: balances.filter((balance) => balance.closing_id === closing.id),
      debtValues: debtValues.filter((debt) => debt.closing_id === closing.id)
    })));
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  async function updateBalance(balance: ClosingBalance, value: string) {
    const nextAmount = parseAmount(value);
    setClosings((current) => current.map((closing) => ({
      ...closing,
      balances: closing.balances.map((item) => item.id === balance.id ? { ...item, actual_balance: nextAmount } : item)
    })));
    await supabase.from("month_closing_balances").update({ actual_balance: nextAmount }).eq("id", balance.id);
  }

  async function updateDebtValue(value: ClosingDebt, amount: string) {
    const nextAmount = parseAmount(amount);
    setClosings((current) => current.map((closing) => ({
      ...closing,
      debtValues: closing.debtValues.map((item) => item.id === value.id ? { ...item, actual_amount: nextAmount } : item)
    })));
    await supabase.from("month_closing_debts").update({ actual_amount: nextAmount }).eq("id", value.id);
  }

  function totalFor(closing: ClosingBundle) {
    const accountTotal = closing.balances.reduce((sum, balance) => {
      const account = accounts.find((item) => item.id === balance.account_id);
      if (!account || account.type === "bound") return sum;
      return sum + Number(balance.actual_balance);
    }, 0);
    const debtTotal = closing.debtValues.reduce((sum, item) => {
      const debt = debts.find((debtRow) => debtRow.id === item.debt_id);
      if (!debt) return sum;
      return sum + (debt.kind === "owed_to_me" ? Number(item.actual_amount) : -Number(item.actual_amount));
    }, 0);
    return accountTotal + debtTotal;
  }

  const latestTotal = useMemo(() => closings[0] ? totalFor(closings[0]) : 0, [closings, accounts, debts]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard closings-page">
        <section className="hero-card compact">
          <h1>{formatEuro(latestTotal)}</h1>
        </section>

        <section className="cards-stack closing-stack">
          {closings.map((closing) => {
            const open = openId === closing.id;
            return (
              <article className="account-card closing-card" key={closing.id}>
                <button className="closing-summary" onClick={() => setOpenId(open ? null : closing.id)}>
                  <strong>{formatMonthTitle(closing.month)}</strong>
                  <b>{formatEuro(totalFor(closing))}</b>
                </button>

                {open && (
                  <div className="closing-edit-list">
                    {closing.balances.map((balance) => {
                      const account = accounts.find((item) => item.id === balance.account_id);
                      if (!account) return null;
                      return (
                        <label key={balance.id}>
                          {account.name}
                          <input inputMode="decimal" defaultValue={formatNumber(Number(balance.actual_balance))} onChange={(e) => updateBalance(balance, e.target.value)} />
                        </label>
                      );
                    })}
                    {closing.debtValues.map((value) => {
                      const debt = debts.find((item) => item.id === value.debt_id);
                      if (!debt) return null;
                      return (
                        <label key={value.id}>
                          {debt.person}
                          <input inputMode="decimal" defaultValue={formatNumber(Number(value.actual_amount))} onChange={(e) => updateDebtValue(value, e.target.value)} />
                        </label>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
          {!closings.length && <p className="muted center">Keine Abrechnung.</p>}
        </section>
      </main>
    </AppShell>
  );
}
