"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, getMonthRange, monthKey } from "@/lib/date";
import { parseAmount } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Transaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function InvestmentsManager() {
  const { session, loading } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [newBalance, setNewBalance] = useState<Record<string, string>>({});
  const currentMonth = monthKey();

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const range = getMonthRange(currentMonth);
    const [accountsRes, txRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", session.user.id).eq("type", "investment").order("created_at"),
      supabase.from("transactions").select("*").eq("user_id", session.user.id).eq("type", "investment").gte("date", range.start).lte("date", range.end).order("date", { ascending: false })
    ]);
    const accountRows = (accountsRes.data ?? []) as Account[];
    setAccounts(accountRows);
    setTransactions((txRes.data ?? []) as Transaction[]);
    setNewBalance(Object.fromEntries(accountRows.map((a) => [a.id, String(Number(a.balance)).replace(".", ",")])));
  }, [session?.user.id, currentMonth]);

  useEffect(() => { load(); }, [load]);

  async function addScalable() {
    if (!session?.user.id) return;
    await supabase.from("accounts").insert({
      user_id: session.user.id,
      name: "Scalable Capital",
      type: "investment",
      include_in_available_net_worth: false,
      balance: 0,
      color: "#A855F7",
      is_active: true
    });
    await load();
  }

  async function updateBalance(account: Account) {
    if (!session?.user.id) return;
    await supabase.from("accounts").update({ balance: parseAmount(newBalance[account.id] ?? "0") }).eq("id", account.id).eq("user_id", session.user.id);
    await load();
  }

  const total = useMemo(() => accounts.reduce((sum, account) => sum + Number(account.balance), 0), [accounts]);
  const investedThisMonth = useMemo(() => transactions.reduce((sum, tx) => sum + Number(tx.amount), 0), [transactions]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="hero-card compact">
          <h1>{formatEuro(total)}</h1>
          <div className="summary-grid">
            <div><span>Investiert</span><strong>{formatEuro(investedThisMonth)}</strong></div>
            <div><span>Konten</span><strong>{accounts.length}</strong></div>
          </div>
        </section>

        <section className="list-card">
          
          {accounts.map((account) => (
            <div className="tx-row" key={account.id}>
              <div>
                <strong>{account.name}</strong>
                <span>{formatEuro(Number(account.balance))}</span>
              </div>
              <div className="tx-actions wide-actions">
                <input inputMode="decimal" value={newBalance[account.id] ?? ""} onChange={(e) => setNewBalance((old) => ({ ...old, [account.id]: e.target.value }))} />
                <button className="mini-button" onClick={() => updateBalance(account)}>Speichern</button>
              </div>
            </div>
          ))}
          {!accounts.length && <p className="muted center">Kein Depot.</p>}
          <button className="primary" onClick={addScalable}>+ Scalable Capital anlegen</button>
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
