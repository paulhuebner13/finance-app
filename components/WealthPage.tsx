"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro } from "@/lib/date";
import { depotNetValue, depotTax } from "@/lib/finance";
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
    setAccounts((accountsRes.data ?? []) as Account[]);
    setDebts((debtsRes.data ?? []) as Debt[]);
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const sums = useMemo(() => {
    const active = accounts
      .filter((account) => account.type === "active" && account.include_in_available_net_worth)
      .reduce((sum, account) => sum + Number(account.balance), 0);
    const bound = accounts
      .filter((account) => account.type === "bound")
      .reduce((sum, account) => sum + Number(account.balance), 0);
    const depot = accounts
      .filter((account) => account.type === "investment")
      .reduce((sum, account) => sum + depotNetValue(Number(account.balance), Number(account.cost_basis ?? 0)), 0);
    const depotGross = accounts
      .filter((account) => account.type === "investment")
      .reduce((sum, account) => sum + Number(account.balance), 0);
    const depotTaxTotal = accounts
      .filter((account) => account.type === "investment")
      .reduce((sum, account) => sum + depotTax(Number(account.balance), Number(account.cost_basis ?? 0)), 0);
    const owedToMe = debts
      .filter((debt) => debt.kind === "owed_to_me")
      .reduce((sum, debt) => sum + Number(debt.amount), 0);
    const iOwe = debts
      .filter((debt) => debt.kind === "i_owe")
      .reduce((sum, debt) => sum + Number(debt.amount), 0);
    const total = active + bound + depot + owedToMe - iOwe;
    return { active, bound, depot, depotGross, depotTaxTotal, owedToMe, iOwe, total };
  }, [accounts, debts]);

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="hero-card compact money-total-card">
          <h1>{formatEuro(sums.total)}</h1>
        </section>

        <section>
          <div className="cards-stack">
            {accounts.map((account) => (
              <article className="account-card money-row" key={account.id} style={{ ["--accent" as string]: account.color }}>
                <div>
                  <strong>{account.name}</strong>
                  <span>
                    {account.type === "active" ? "Konto" : account.type === "bound" ? "Gebunden" : `Depot · Steuer ${formatEuro(depotTax(Number(account.balance), Number(account.cost_basis ?? 0)))}`}
                    {account.is_default ? " · Standard" : ""}
                  </span>
                </div>
                <b>{account.type === "investment" ? formatEuro(depotNetValue(Number(account.balance), Number(account.cost_basis ?? 0))) : formatEuro(Number(account.balance))}</b>
              </article>
            ))}
            {debts.map((debt) => (
              <article className="account-card money-row debt-money-row" key={debt.id} style={{ ["--accent" as string]: debt.kind === "i_owe" ? "#EF4444" : "#22C55E" }}>
                <div>
                  <strong>{debt.person}</strong>
                  <span>{debt.kind === "i_owe" ? "Ich schulde" : "Bei mir offen"}</span>
                </div>
                <b>{debt.kind === "i_owe" ? "-" : "+"}{formatEuro(Number(debt.amount))}</b>
              </article>
            ))}
            {!accounts.length && !debts.length && <p className="muted center">Leer.</p>}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
