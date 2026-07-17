"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, formatNumber } from "@/lib/date";
import {
  depotNetValueAfterTax,
  depotTaxFromPositions,
  investmentCashFlowsByAccount,
  parseAmount,
  taxableProfitFromPositions
} from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, InvestmentTaxPosition, Transaction } from "@/lib/types";
import { useSession } from "@/lib/useSession";

type DepotValues = Record<string, { balance: string }>;
type TaxInputs = Record<string, string>;

export function InvestmentsManager() {
  const { session, loading } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [taxPositions, setTaxPositions] = useState<InvestmentTaxPosition[]>([]);
  const [values, setValues] = useState<DepotValues>({});
  const [taxInputs, setTaxInputs] = useState<TaxInputs>({});
  const [newDepotName, setNewDepotName] = useState("");
  const [openTaxAccountId, setOpenTaxAccountId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const [accountsRes, transactionsRes, positionsRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("type", "investment")
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", session.user.id)
        .or("type.eq.investment,type.eq.transfer")
        .order("date"),
      supabase
        .from("investment_tax_positions")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .order("created_at")
    ]);

    const accountRows = (accountsRes.data ?? []) as Account[];
    const transactionRows = (transactionsRes.data ?? []) as Transaction[];
    const positionRows = positionsRes.error ? [] : ((positionsRes.data ?? []) as InvestmentTaxPosition[]);

    setAccounts(accountRows);
    setTransactions(transactionRows);
    setTaxPositions(positionRows);
    setValues(Object.fromEntries(accountRows.map((a) => [a.id, { balance: formatNumber(Number(a.balance)) }])));
    setTaxInputs(Object.fromEntries(positionRows.map((p) => [p.id, formatNumber(Number(p.profit_loss))])));
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const cashFlowByAccount = useMemo(() => investmentCashFlowsByAccount(transactions), [transactions]);

  function positionsFor(accountId: string) {
    return taxPositions.filter((position) => position.account_id === accountId && position.is_active);
  }

  function taxFor(accountId: string) {
    return depotTaxFromPositions(positionsFor(accountId));
  }

  async function addDepot() {
    if (!session?.user.id) return;
    const { error } = await supabase.from("accounts").insert({
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
    if (error) throw error;
    setNewDepotName("");
    await load();
  }

  async function updateDepotValue(account: Account) {
    if (!session?.user.id) return;
    const current = values[account.id] ?? { balance: "0" };
    const balance = parseAmount(current.balance);
    const tax = taxFor(account.id);
    await supabase.from("accounts").update({
      balance,
      tax_reserve: tax
    }).eq("id", account.id).eq("user_id", session.user.id);
    await load();
  }

  async function deleteDepot(account: Account) {
    if (!session?.user.id) return;
    await supabase.from("accounts").update({ is_active: false }).eq("id", account.id).eq("user_id", session.user.id);
    await load();
  }

  async function addTaxPosition(account: Account) {
    if (!session?.user.id) return;
    const { data, error } = await supabase
      .from("investment_tax_positions")
      .insert({
        user_id: session.user.id,
        account_id: account.id,
        name: "Position",
        profit_loss: 0,
        is_active: true
      })
      .select("*")
      .single();
    if (error) throw error;
    const row = data as InvestmentTaxPosition;
    setTaxPositions((current) => [...current, row]);
    setTaxInputs((current) => ({ ...current, [row.id]: "0,00" }));
    setOpenTaxAccountId(account.id);
  }

  async function updateTaxPosition(position: InvestmentTaxPosition, patch: Partial<InvestmentTaxPosition>) {
    if (!session?.user.id) return;
    setTaxPositions((current) => current.map((item) => item.id === position.id ? { ...item, ...patch } : item));
    await supabase
      .from("investment_tax_positions")
      .update(patch)
      .eq("id", position.id)
      .eq("user_id", session.user.id);
    const accountPositions = taxPositions
      .map((item) => item.id === position.id ? { ...item, ...patch } : item)
      .filter((item) => item.account_id === position.account_id && item.is_active);
    await supabase
      .from("accounts")
      .update({ tax_reserve: depotTaxFromPositions(accountPositions) })
      .eq("id", position.account_id)
      .eq("user_id", session.user.id);
  }

  async function updateTaxProfit(position: InvestmentTaxPosition, nextValue: string) {
    setTaxInputs((current) => ({ ...current, [position.id]: nextValue }));
    await updateTaxPosition(position, { profit_loss: parseAmount(nextValue) });
  }

  async function deleteTaxPosition(position: InvestmentTaxPosition) {
    await updateTaxPosition(position, { is_active: false });
  }

  const summary = useMemo(() => {
    const gross = accounts.reduce((sum, account) => sum + Number(account.balance), 0);
    const spent = accounts.reduce((sum, account) => sum + Number(cashFlowByAccount.get(account.id) ?? 0), 0);
    const profit = gross - spent;
    const taxableProfit = accounts.reduce((sum, account) => sum + taxableProfitFromPositions(positionsFor(account.id)), 0);
    const tax = accounts.reduce((sum, account) => sum + taxFor(account.id), 0);
    const net = gross - tax;
    return { gross, spent, profit, taxableProfit, tax, net };
  }, [accounts, cashFlowByAccount, taxPositions]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard investments-page">
        <section className="hero-card compact">
          <h1>{formatEuro(summary.net)}</h1>
          <div className="summary-grid depot-summary-grid">
            <div><span>Depotwert</span><strong>{formatEuro(summary.gross)}</strong></div>
            <div><span>Ausgabewert</span><strong>{formatEuro(summary.spent)}</strong></div>
            <div><span>Steigerung</span><strong>{summary.profit >= 0 ? "+" : ""}{formatEuro(summary.profit)}</strong></div>
            <div><span>Steuer</span><strong>{formatEuro(summary.tax)}</strong></div>
          </div>
        </section>

        <section className="form-card depot-create-card">
          <input value={newDepotName} onChange={(e) => setNewDepotName(e.target.value)} placeholder="Depotname" />
          <button className="primary" onClick={addDepot}>Depot anlegen</button>
        </section>

        <section className="cards-stack">
          {accounts.map((account) => {
            const current = values[account.id] ?? { balance: "" };
            const gross = parseAmount(current.balance);
            const spent = Number(cashFlowByAccount.get(account.id) ?? 0);
            const profit = gross - spent;
            const accountPositions = positionsFor(account.id);
            const taxableProfit = taxableProfitFromPositions(accountPositions);
            const tax = depotTaxFromPositions(accountPositions);
            const net = depotNetValueAfterTax(gross, tax);
            const taxOpen = openTaxAccountId === account.id;
            return (
              <article className="depot-card clean-depot-card" key={account.id}>
                <div className="depot-card-head">
                  <strong>{account.name}</strong>
                  <div className="button-row">
                    <button className="mini-button" onClick={() => updateDepotValue(account)}>Speichern</button>
                    <button className="mini-button danger" onClick={() => deleteDepot(account)}>löschen</button>
                  </div>
                </div>

                <div className="depot-value-grid portfolio-value-grid">
                  <label className="depot-value-tile">
                    <span>Depotwert</span>
                    <input inputMode="decimal" value={current.balance} onChange={(e) => setValues((old) => ({ ...old, [account.id]: { balance: e.target.value } }))} />
                  </label>
                  <div className="depot-value-tile readonly">
                    <span>Ausgabewert</span>
                    <strong>{formatEuro(spent)}</strong>
                  </div>
                  <div className="depot-value-tile readonly">
                    <span>Steigerung</span>
                    <strong>{profit >= 0 ? "+" : ""}{formatEuro(profit)}</strong>
                  </div>
                  <div className="depot-value-tile readonly">
                    <span>Steuer</span>
                    <strong>{formatEuro(tax)}</strong>
                  </div>
                  <div className="depot-value-tile readonly">
                    <span>Nach Steuer</span>
                    <strong>{formatEuro(net)}</strong>
                  </div>
                </div>

                <button className="secondary wide tax-toggle-button" onClick={() => setOpenTaxAccountId(taxOpen ? null : account.id)}>
                  Steuerpositionen {taxOpen ? "schließen" : "bearbeiten"}
                </button>

                {taxOpen && (
                  <section className="tax-position-panel">
                    <div className="tax-panel-head">
                      <div>
                        <strong>Steuerbasis</strong>
                        <span>Gewinne und Verluste je Position eintragen.</span>
                      </div>
                      <div className="tax-panel-summary">
                        <span>steuerpflichtig {formatEuro(taxableProfit)}</span>
                        <b>{formatEuro(tax)}</b>
                      </div>
                    </div>
                    <div className="tax-position-list">
                      {accountPositions.map((position) => (
                        <article className="tax-position-row" key={position.id}>
                          <input
                            value={position.name}
                            onChange={(e) => updateTaxPosition(position, { name: e.target.value })}
                            placeholder="Position"
                          />
                          <input
                            value={taxInputs[position.id] ?? formatNumber(Number(position.profit_loss))}
                            inputMode="decimal"
                            onChange={(e) => updateTaxProfit(position, e.target.value)}
                            placeholder="Gewinn/Verlust"
                          />
                          <button className="mini-button danger" onClick={() => deleteTaxPosition(position)}>löschen</button>
                        </article>
                      ))}
                      {!accountPositions.length && <p className="muted small center">Keine Steuerpositionen.</p>}
                    </div>
                    <button className="secondary wide" onClick={() => addTaxPosition(account)}>+ Zeile hinzufügen</button>
                  </section>
                )}
              </article>
            );
          })}
          {!accounts.length && <p className="muted center">Kein Depot.</p>}
        </section>
      </main>
    </AppShell>
  );
}
