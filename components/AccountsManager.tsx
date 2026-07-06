"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Account, AccountType } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function AccountsManager() {
  const { session, loading } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("active");
  const [balance, setBalance] = useState("");

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const { data } = await supabase.from("accounts").select("*").eq("user_id", session.user.id).order("created_at");
    setAccounts((data ?? []) as Account[]);
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const sums = useMemo(() => {
    return {
      available: accounts.filter((a) => a.include_in_available_net_worth).reduce((sum, a) => sum + Number(a.balance), 0),
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
      balance: Number(balance.replace(",", ".")) || 0,
      color: type === "active" ? "#38BDF8" : type === "bound" ? "#F59E0B" : "#A855F7"
    });
    setName("");
    setBalance("");
    setType("active");
    await load();
  }

  async function updateAccount(account: Account, patch: Partial<Account>) {
    if (!session?.user.id) return;
    await supabase.from("accounts").update(patch).eq("id", account.id).eq("user_id", session.user.id);
    await load();
  }

  async function setDefaultAccount(account: Account) {
    if (!session?.user.id || account.type !== "active") return;
    await supabase.from("accounts").update({ is_default: false }).eq("user_id", session.user.id);
    await supabase.from("accounts").update({ is_default: true, include_in_available_net_worth: true, is_active: true }).eq("id", account.id).eq("user_id", session.user.id);
    await load();
  }

  async function renameAccount(account: Account) {
    const next = window.prompt("Konto umbenennen", account.name);
    if (!next?.trim()) return;
    await updateAccount(account, { name: next.trim() });
  }

  async function deactivateAccount(account: Account) {
    await updateAccount(account, { is_active: false });
  }

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="hero-card compact">
          <h1>{formatEuro(sums.available)}</h1>
          <div className="summary-grid">
            <div><span>Gebunden</span><strong>{formatEuro(sums.bound)}</strong></div>
            <div><span>Investment</span><strong>{formatEuro(sums.investment)}</strong></div>
          </div>
        </section>


        <section className="cards-stack">
          {accounts.map((account) => (
            <article className="account-card" key={account.id} style={{ ["--accent" as string]: account.color }}>
              <div>
                <strong>{account.name}</strong>
                <span>{account.type === "active" ? "Aktiv" : account.type === "bound" ? "Gebunden" : "Investment"}{!account.is_active ? " · inaktiv" : ""}</span>
              </div>
              <input
                defaultValue={String(account.balance)}
                inputMode="decimal"
                onBlur={(e) => updateAccount(account, { balance: Number(e.target.value.replace(",", ".")) || 0 })}
              />
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
              <div className="button-row">
                <button className="mini-button" onClick={() => renameAccount(account)}>umbenennen</button>
                <button className="mini-button" onClick={() => updateAccount(account, { is_active: !account.is_active })}>{account.is_active ? "pausieren" : "aktivieren"}</button>
                <button className="mini-button danger" onClick={() => deactivateAccount(account)}>deaktivieren</button>
              </div>
            </article>
          ))}
        </section>
        <section className="form-card add-account-card">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Neues Konto" />
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            <option value="active">Aktiv</option>
            <option value="bound">Gebunden</option>
            <option value="investment">Investment</option>
          </select>
          <input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder="Stand" />
          <button className="primary" onClick={addAccount}>Hinzufügen</button>
        </section>
      </main>
    </AppShell>
  );
}
