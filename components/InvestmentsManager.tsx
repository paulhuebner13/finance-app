"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, getMonthRange, monthKey } from "@/lib/date";
import { depotNetValue, depotTax, parseAmount } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Transaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function InvestmentsManager() {
  const { session, loading } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [values, setValues] = useState<Record<string, { balance: string; taxBase: string }>>({});
  const [newDepotName, setNewDepotName] = useState("");
  const currentMonth = monthKey();

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const range = getMonthRange(currentMonth);
    const [accountsRes, txRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", session.user.id).eq("type", "investment").eq("is_active", true).order("created_at"),
      supabase.from("transactions").select("*").eq("user_id", session.user.id).eq("type", "investment").gte("date", range.start).lte("date", range.end).order("date", { ascending: false })
    ]);
    const accountRows = (accountsRes.data ?? []) as Account[];
    setAccounts(accountRows);
    setTransactions((txRes.data ?? []) as Transaction[]);
    setValues(Object.fromEntries(accountRows.map((a) => [a.id, {
      balance: String(Number(a.balance)).replace(".", ","),
      taxBase: String(Number(a.cost_basis ?? 0)).replace(".", ",")
    }])));
  }, [session?.user.id, currentMonth]);

  useEffect(() => { load(); }, [load]);

  async function addDepot() {
    if (!session?.user.id) return;
    await supabase.from("accounts").insert({
      user_id: session.user.id,
      name: newDepotName.trim() || "Depot",
      type: "investment",
      include_in_available_net_worth: false,
      balance: 0,
      cost_basis: 0,
      tax_reserve: 0,
      color: "#A855F7",
      is_active: true
    });
    setNewDepotName("");
    await load();
  }

  async function updateDepot(account: Account) {
    if (!session?.user.id) return;
    const current = values[account.id] ?? { balance: "0", taxBase: "0" };
    const balance = parseAmount(current.balance);
    const taxBase = parseAmount(current.taxBase);
    await supabase.from("accounts").update({
      balance,
      cost_basis: taxBase,
      tax_reserve: depotTax(balance, taxBase)
    }).eq("id", account.id).eq("user_id", session.user.id);
    await load();
  }

  async function deleteDepot(account: Account) {
    if (!session?.user.id) return;
    await supabase.from("accounts").update({ is_active: false }).eq("id", account.id).eq("user_id", session.user.id);
    await load();
  }

  const summary = useMemo(() => {
    const gross = accounts.reduce((sum, account) => sum + Number(account.balance), 0);
    const taxBase = accounts.reduce((sum, account) => sum + Number(account.cost_basis ?? 0), 0);
    const tax = accounts.reduce((sum, account) => sum + depotTax(Number(account.balance), Number(account.cost_basis ?? 0)), 0);
    const net = gross - tax;
    const gain = gross - taxBase;
    const investedThisMonth = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
    return { gross, taxBase, gain, tax, net, investedThisMonth };
  }, [accounts, transactions]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="hero-card compact">
          <h1>{formatEuro(summary.net)}</h1>
          <div className="summary-grid">
            <div><span>Depotwert</span><strong>{formatEuro(summary.gross)}</strong></div>
            <div><span>Steuer</span><strong>{formatEuro(summary.tax)}</strong></div>
            <div><span>Steuerbasis</span><strong>{formatEuro(summary.taxBase)}</strong></div>
            <div><span>Monat</span><strong>{formatEuro(summary.investedThisMonth)}</strong></div>
          </div>
        </section>

        <section className="list-card">
          {accounts.map((account) => {
            const current = values[account.id] ?? { balance: "", taxBase: "" };
            const gross = parseAmount(current.balance);
            const taxBase = parseAmount(current.taxBase);
            const tax = depotTax(gross, taxBase);
            const net = depotNetValue(gross, taxBase);
            const gain = gross - taxBase;
            return (
              <div className="depot-card" key={account.id}>
                <div className="budget-card-header">
                  <div>
                    <strong>{account.name}</strong>
                    <span className="muted small">{formatEuro(net)} · Steuer {formatEuro(tax)} · {gain >= 0 ? "+" : ""}{formatEuro(gain)}</span>
                  </div>
                  <div className="button-row">
                    <button className="mini-button" onClick={() => updateDepot(account)}>Speichern</button>
                    <button className="mini-button danger" onClick={() => deleteDepot(account)}>löschen</button>
                  </div>
                </div>
                <div className="grid-2">
                  <label>Depotwert<input inputMode="decimal" value={current.balance} onChange={(e) => setValues((old) => ({ ...old, [account.id]: { ...current, balance: e.target.value } }))} /></label>
                  <label>Steuerbasis<input inputMode="decimal" value={current.taxBase} onChange={(e) => setValues((old) => ({ ...old, [account.id]: { ...current, taxBase: e.target.value } }))} /></label>
                </div>
                <div className="tax-preview">
                  <span>Steuer</span>
                  <strong>{formatEuro(tax)}</strong>
                </div>
              </div>
            );
          })}
          {!accounts.length && <p className="muted center">Kein Depot.</p>}
          <div className="add-depot-row">
            <input value={newDepotName} onChange={(e) => setNewDepotName(e.target.value)} placeholder="Depotname" />
            <button className="primary" onClick={addDepot}>Depot anlegen</button>
          </div>
        </section>

        <section className="list-card">
          {transactions.map((tx) => (
            <div className="tx-row" key={tx.id}>
              <div>
                <strong>{tx.note || "Investition"}</strong>
                <span>{tx.date}</span>
              </div>
              <b>{formatEuro(Number(tx.amount))}</b>
            </div>
          ))}
          {!transactions.length && <p className="muted center">Keine Investitionen.</p>}
        </section>
      </main>
    </AppShell>
  );
}
