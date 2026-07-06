"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Account } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function WealthPage() {
  const { session, loading } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("is_active", true)
      .order("created_at");
    setAccounts((data ?? []) as Account[]);
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const sums = useMemo(() => {
    const available = accounts
      .filter((account) => account.include_in_available_net_worth)
      .reduce((sum, account) => sum + Number(account.balance), 0);
    const bound = accounts
      .filter((account) => !account.include_in_available_net_worth && account.type === "bound")
      .reduce((sum, account) => sum + Number(account.balance), 0);
    const depot = accounts
      .filter((account) => account.type === "investment")
      .reduce((sum, account) => sum + Number(account.balance), 0);
    const totalStored = available + bound + depot;
    return { available, bound, depot, totalStored };
  }, [accounts]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="hero-card compact">
          <p className="eyebrow">Geldübersicht</p>
          <h1>{formatEuro(sums.available)}</h1>
          <p className="muted">verfügbar auf aktiven Konten</p>
          <div className="summary-grid">
            <div><span>Depot</span><strong>{formatEuro(sums.depot)}</strong></div>
            <div><span>Gebunden</span><strong>{formatEuro(sums.bound)}</strong></div>
            <div><span>Gesamt gespeichert</span><strong>{formatEuro(sums.totalStored)}</strong></div>
            <div><span>Ohne Depot</span><strong>{formatEuro(sums.available + sums.bound)}</strong></div>
          </div>
        </section>

        <section>
          <div className="section-title">
            <h2>Konten</h2>
            <p>aktueller Stand</p>
          </div>
          <div className="cards-stack">
            {accounts.map((account) => (
              <article className="account-card money-row" key={account.id} style={{ ["--accent" as string]: account.color }}>
                <div>
                  <strong>{account.name}</strong>
                  <span>
                    {account.type === "active" ? "Aktives Konto" : account.type === "bound" ? "Gebunden" : "Depot"}
                    {account.is_default ? " · Standard" : ""}
                  </span>
                </div>
                <b>{formatEuro(Number(account.balance))}</b>
              </article>
            ))}
            {!accounts.length && <p className="muted center">Noch keine Konten angelegt.</p>}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
