"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, formatNumber } from "@/lib/date";
import { parseAmount } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Debt, DebtKind } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function DebtsManager() {
  const { session, loading } = useSession();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<DebtKind>("i_owe");
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const { data } = await supabase
      .from("debts")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    setDebts((data ?? []) as Debt[]);
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  const net = useMemo(() => {
    return debts.filter((debt) => debt.is_active).reduce((sum, debt) => sum + (debt.kind === "owed_to_me" ? Number(debt.amount) : -Number(debt.amount)), 0);
  }, [debts]);

  async function addDebt() {
    if (!session?.user.id || !person.trim()) return;
    await supabase.from("debts").insert({
      user_id: session.user.id,
      person: person.trim(),
      amount: parseAmount(amount),
      kind,
      note: note.trim() || null,
      is_active: true
    });
    setPerson("");
    setAmount("");
    setNote("");
    setKind("i_owe");
    await load();
  }

  async function updateDebt(debt: Debt, patch: Partial<Debt>) {
    if (!session?.user.id) return;
    setDebts((current) => current.map((item) => item.id === debt.id ? { ...item, ...patch } : item));
    await supabase.from("debts").update(patch).eq("id", debt.id).eq("user_id", session.user.id);
  }

  async function deleteDebt(debt: Debt) {
    if (!session?.user.id) return;
    await supabase.from("debts").delete().eq("id", debt.id).eq("user_id", session.user.id);
    await load();
  }

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard debts-page">
        <section className="hero-card compact">
          <h1>{formatEuro(net)}</h1>
        </section>

        <section className="cards-stack debt-stack compact-debt-stack">
          {debts.map((debt) => {
            const isOpen = expanded === debt.id;
            const positive = debt.kind === "owed_to_me";
            return (
              <article className={`debt-card debt-card-collapsible ${!debt.is_active ? "is-disabled" : ""}`} key={debt.id} style={{ ["--accent" as string]: positive ? "#16A34A" : "#DC2626" }}>
                <div className="debt-summary-line">
                  <div>
                    <strong>{debt.person}</strong>
                    {debt.note && <span>{debt.note}</span>}
                  </div>
                  <b>{positive ? "+" : "−"}{formatEuro(Number(debt.amount))}</b>
                </div>
                <button className="mini-button edit-toggle" onClick={() => setExpanded(isOpen ? null : debt.id)}>{isOpen ? "schließen" : "bearbeiten"}</button>

                {isOpen && (
                  <div className="debt-edit-panel">
                    <input defaultValue={debt.person} placeholder="Name" onChange={(e) => e.target.value.trim() && updateDebt(debt, { person: e.target.value.trim() })} />
                    <input inputMode="decimal" defaultValue={formatNumber(Number(debt.amount))} placeholder="Betrag" onChange={(e) => updateDebt(debt, { amount: parseAmount(e.target.value) })} />
                    <select value={debt.kind} onChange={(e) => updateDebt(debt, { kind: e.target.value as DebtKind })}>
                      <option value="i_owe">Schulde ich</option>
                      <option value="owed_to_me">Schuldet mir</option>
                    </select>
                    <input defaultValue={debt.note ?? ""} placeholder="Notiz" onChange={(e) => updateDebt(debt, { note: e.target.value.trim() || null })} />
                    <div className="button-row">
                      <button className="mini-button" onClick={() => updateDebt(debt, { is_active: !debt.is_active })}>{debt.is_active ? "pausieren" : "aktivieren"}</button>
                      <button className="mini-button danger" onClick={() => deleteDebt(debt)}>löschen</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {!debts.length && <p className="muted center">Leer.</p>}
        </section>

        <section className="form-card add-debt-card">
          <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Titel / Person" />
          <div className="grid-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as DebtKind)}>
              <option value="i_owe">Schulde ich</option>
              <option value="owed_to_me">Schuldet mir</option>
            </select>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Betrag" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz" />
          <button className="primary" onClick={addDebt}>Hinzufügen</button>
        </section>
      </main>
    </AppShell>
  );
}
