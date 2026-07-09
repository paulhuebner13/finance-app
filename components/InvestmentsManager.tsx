"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, formatNumber } from "@/lib/date";
import { depotNetValue, depotTax, parseAmount } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function InvestmentsManager() {
  const { session, loading } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [values, setValues] = useState<Record<string, { balance: string; taxBase: string }>>({});
  const [newDepotName, setNewDepotName] = useState("");

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const accountsRes = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("type", "investment")
      .eq("is_active", true)
      .order("created_at");
    const accountRows = (accountsRes.data ?? []) as Account[];
    setAccounts(accountRows);
    setValues(Object.fromEntries(accountRows.map((a) => [a.id, {
      balance: formatNumber(Number(a.balance)),
      taxBase: formatNumber(Number(a.cost_basis ?? 0))
    }])));
  }, [session?.user.id]);

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
      color: "#6254C7",
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
    return { gross, taxBase, tax, net };
  }, [accounts]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard investments-page">
        <section className="hero-card compact">
          <h1>{formatEuro(summary.net)}</h1>
          <div className="summary-grid">
            <div><span>Depotwert</span><strong>{formatEuro(summary.gross)}</strong></div>
            <div><span>Steuerbasis</span><strong>{formatEuro(summary.taxBase)}</strong></div>
            <div><span>Steuer</span><strong>{formatEuro(summary.tax)}</strong></div>
          </div>
        </section>

        <section className="form-card depot-create-card">
          <input value={newDepotName} onChange={(e) => setNewDepotName(e.target.value)} placeholder="Depotname" />
          <button className="primary" onClick={addDepot}>Depot anlegen</button>
        </section>

        <section className="cards-stack">
          {accounts.map((account) => {
            const current = values[account.id] ?? { balance: "", taxBase: "" };
            const gross = parseAmount(current.balance);
            const taxBase = parseAmount(current.taxBase);
            const tax = depotTax(gross, taxBase);
            return (
              <article className="depot-card clean-depot-card" key={account.id}>
                <div className="depot-card-head">
                  <strong>{account.name}</strong>
                  <div className="button-row">
                    <button className="mini-button" onClick={() => updateDepot(account)}>Speichern</button>
                    <button className="mini-button danger" onClick={() => deleteDepot(account)}>löschen</button>
                  </div>
                </div>
                <div className="depot-value-grid">
                  <label className="depot-value-tile">
                    <span>Depotwert</span>
                    <input inputMode="decimal" value={current.balance} onChange={(e) => setValues((old) => ({ ...old, [account.id]: { ...current, balance: e.target.value } }))} />
                  </label>
                  <label className="depot-value-tile">
                    <span>Steuerbasis</span>
                    <input inputMode="decimal" value={current.taxBase} onChange={(e) => setValues((old) => ({ ...old, [account.id]: { ...current, taxBase: e.target.value } }))} />
                  </label>
                  <div className="depot-value-tile readonly">
                    <span>Steuer</span>
                    <strong>{formatEuro(tax)}</strong>
                  </div>
                </div>
              </article>
            );
          })}
          {!accounts.length && <p className="muted center">Kein Depot.</p>}
        </section>
      </main>
    </AppShell>
  );
}
