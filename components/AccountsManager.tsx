"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, formatNumber } from "@/lib/date";
import { parseAmount, sortAccountsStable } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, AccountType } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function AccountsManager() {
  const { session, loading } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("active");
  const [balance, setBalance] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const { data } = await supabase.from("accounts").select("*").eq("user_id", session.user.id).eq("is_active", true).order("created_at");
    setAccounts(sortAccountsStable((data ?? []) as Account[]));
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const sums = useMemo(() => {
    return {
      available: accounts.filter((a) => a.type === "active" && a.include_in_available_net_worth).reduce((sum, a) => sum + Number(a.balance), 0),
      bound: accounts.filter((a) => !a.include_in_available_net_worth && a.type === "bound").reduce((sum, a) => sum + Number(a.balance), 0),
      investment: accounts.filter((a) => a.type === "investment").reduce((sum, a) => sum + Number(a.balance), 0)
    };
  }, [accounts]);

  async function addAccount() {
    if (!session?.user.id || !name.trim()) return;
    const shouldBeDefault = type === "active" && !accounts.some((account) => account.is_default && account.is_active);
    await supabase.from("accounts").insert({
      user_id: session.user.id,
      name: name.trim(),
      type,
      include_in_available_net_worth: type === "active",
      is_default: shouldBeDefault,
      balance: parseAmount(balance),
      cost_basis: 0,
      tax_reserve: 0,
      color: type === "active" ? "#315FBD" : type === "bound" ? "#B7791F" : "#6D5BD0"
    });
    setName("");
    setBalance("");
    setType("active");
    await load();
  }

  async function updateAccount(account: Account, patch: Partial<Account>) {
    if (!session?.user.id) return;
    setAccounts((current) => sortAccountsStable(current.map((item) => item.id === account.id ? { ...item, ...patch } : item)));
    await supabase.from("accounts").update(patch).eq("id", account.id).eq("user_id", session.user.id);
  }

  async function setDefaultAccount(account: Account) {
    if (!session?.user.id || account.type !== "active") return;
    await supabase.from("accounts").update({ is_default: false }).eq("user_id", session.user.id);
    await supabase.from("accounts").update({ is_default: true, include_in_available_net_worth: true, is_active: true }).eq("id", account.id).eq("user_id", session.user.id);
    await load();
  }

  async function deactivateAccount(account: Account) {
    await updateAccount(account, { is_active: false });
  }

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard accounts-page">
        <section className="hero-card compact">
          <h1>{formatEuro(sums.available)}</h1>
          <div className="summary-grid">
            <div><span>Gebunden</span><strong>{formatEuro(sums.bound)}</strong></div>
            <div><span>Depot</span><strong>{formatEuro(sums.investment)}</strong></div>
          </div>
        </section>

        <section className="cards-stack account-stack-collapsible">
          {accounts.map((account) => {
            const isOpen = expanded === account.id;
            return (
              <article className={`account-card account-collapsible-card ${isOpen ? "expanded" : ""}`} key={account.id} style={{ ["--accent" as string]: account.color }}>
                <button className="account-summary-button" onClick={() => setExpanded(isOpen ? null : account.id)}>
                  <strong>{account.name}</strong>
                  <span>{formatEuro(Number(account.balance))}</span>
                </button>

                {isOpen && (
                  <div className="account-detail-panel">
                    <label>
                      Betrag
                      <input
                        defaultValue={formatNumber(Number(account.balance))}
                        inputMode="decimal"
                        onChange={(e) => updateAccount(account, { balance: parseAmount(e.target.value) })}
                      />
                    </label>
                    <select value={account.type} onChange={(e) => updateAccount(account, { type: e.target.value as AccountType, include_in_available_net_worth: e.target.value === "active" })}>
                      <option value="active">Aktiv</option>
                      <option value="bound">Gebunden</option>
                      <option value="investment">Depot</option>
                    </select>
                    <label className="inline-toggle">
                      <input
                        type="checkbox"
                        checked={account.include_in_available_net_worth}
                        onChange={(e) => updateAccount(account, { include_in_available_net_worth: e.target.checked })}
                      />
                      verfügbar
                    </label>
                    {account.type === "active" && (
                      <label className="inline-toggle">
                        <input
                          type="checkbox"
                          checked={account.is_default}
                          onChange={(e) => { if (e.target.checked) setDefaultAccount(account); }}
                        />
                        Standardkonto
                      </label>
                    )}
                    <input value={account.name} onChange={(e) => updateAccount(account, { name: e.target.value })} />
                    <div className="button-row">
                      <button className="mini-button" onClick={() => updateAccount(account, { is_active: !account.is_active })}>{account.is_active ? "pausieren" : "aktivieren"}</button>
                      <button className="mini-button danger" onClick={() => deactivateAccount(account)}>löschen</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <section className="form-card add-account-card">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Neues Konto" />
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            <option value="active">Aktiv</option>
            <option value="bound">Gebunden</option>
            <option value="investment">Depot</option>
          </select>
          <input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder="Stand" />
          <button className="primary" onClick={addAccount}>Hinzufügen</button>
        </section>
      </main>
    </AppShell>
  );
}
