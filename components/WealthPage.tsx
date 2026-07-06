"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro } from "@/lib/date";
import { depotNetValue, sortAccountsStable } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Account, Debt } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function WealthPage() {
  const { session, loading } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const [accountsRes, debtsRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("debts")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .order("created_at")
    ]);
    setAccounts(sortAccountsStable((accountsRes.data ?? []) as Account[]));
    setDebts((debtsRes.data ?? []) as Debt[]);
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const sums = useMemo(() => {
    const active = accounts
      .filter((account) => account.type === "active" && account.include_in_available_net_worth)
      .reduce((sum, account) => sum + Number(account.balance), 0);
    const depot = accounts
      .filter((account) => account.type === "investment")
      .reduce((sum, account) => sum + depotNetValue(Number(account.balance), Number(account.cost_basis ?? 0)), 0);
    const owedToMe = debts
      .filter((debt) => debt.kind === "owed_to_me")
      .reduce((sum, debt) => sum + Number(debt.amount), 0);
    const iOwe = debts
      .filter((debt) => debt.kind === "i_owe")
      .reduce((sum, debt) => sum + Number(debt.amount), 0);
    const debtNet = owedToMe - iOwe;
    const total = active + depot + debtNet;
    return { active, depot, owedToMe, iOwe, debtNet, total };
  }, [accounts, debts]);

  const activeAccounts = accounts.filter((account) => account.type === "active" && account.include_in_available_net_worth);
  const depots = accounts.filter((account) => account.type === "investment");
  const boundAccounts = accounts.filter((account) => account.type === "bound");
  const hasDebts = debts.length > 0 || sums.debtNet !== 0;

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard wealth-page">
        <section className="hero-card compact money-total-card">
          <h1>{formatEuro(sums.total)}</h1>
        </section>

        <section>
          <div className="cards-stack money-stack">
            {activeAccounts.map((account) => (
              <article className="account-card money-row clean-money-row" key={account.id} style={{ ["--accent" as string]: account.color }}>
                <strong>{account.name}</strong>
                <b>{formatEuro(Number(account.balance))}</b>
              </article>
            ))}

            {depots.map((account) => {
              const net = depotNetValue(Number(account.balance), Number(account.cost_basis ?? 0));
              return (
                <article className="account-card money-row clean-money-row" key={account.id} style={{ ["--accent" as string]: account.color }}>
                  <strong>{account.name}</strong>
                  <b>{formatEuro(net)}</b>
                </article>
              );
            })}

            {boundAccounts.map((account) => (
              <article className="account-card money-row clean-money-row muted-money-row" key={account.id} style={{ ["--accent" as string]: account.color }}>
                <strong>{account.name}</strong>
                <b>{formatEuro(Number(account.balance))}</b>
              </article>
            ))}

            {hasDebts && (
              <article className="account-card money-row clean-money-row debt-money-row" style={{ ["--accent" as string]: sums.debtNet < 0 ? "#EF4444" : "#22C55E" }}>
                <strong>Schulden</strong>
                <b>{sums.debtNet >= 0 ? "+" : ""}{formatEuro(sums.debtNet)}</b>
              </article>
            )}

            {!accounts.length && !debts.length && <p className="muted center">Leer.</p>}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
