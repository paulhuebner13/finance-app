"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro } from "@/lib/date";
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

  const sums = useMemo(() => {
    const active = debts.filter((debt) => debt.is_active);
    const iOwe = active.filter((debt) => debt.kind === "i_owe").reduce((sum, debt) => sum + Number(debt.amount), 0);
    const owedToMe = active.filter((debt) => debt.kind === "owed_to_me").reduce((sum, debt) => sum + Number(debt.amount), 0);
    return { iOwe, owedToMe, net: owedToMe - iOwe };
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
    await supabase.from("debts").update(patch).eq("id", debt.id).eq("user_id", session.user.id);
    await load();
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
      <main className="dashboard">
        <section className="hero-card compact">
          <h1>{formatEuro(sums.net)}</h1>
          <div className="summary-grid">
            <div><span>Ich schulde</span><strong>{formatEuro(sums.iOwe)}</strong></div>
            <div><span>Bei mir offen</span><strong>{formatEuro(sums.owedToMe)}</strong></div>
          </div>
        </section>

        <section className="cards-stack">
          {debts.map((debt) => (
            <article className={`debt-card ${!debt.is_active ? "is-disabled" : ""}`} key={debt.id} style={{ ["--accent" as string]: debt.kind === "i_owe" ? "#EF4444" : "#22C55E" }}>
              <div className="debt-grid">
                <input className="plain-input" defaultValue={debt.person} onBlur={(e) => e.target.value.trim() && updateDebt(debt, { person: e.target.value.trim() })} />
                <input className="budget-input" inputMode="decimal" defaultValue={String(debt.amount)} onBlur={(e) => updateDebt(debt, { amount: parseAmount(e.target.value) })} />
                <select value={debt.kind} onChange={(e) => updateDebt(debt, { kind: e.target.value as DebtKind })}>
                  <option value="i_owe">ich schulde</option>
                  <option value="owed_to_me">bei mir offen</option>
                </select>
                <input defaultValue={debt.note ?? ""} placeholder="Notiz" onBlur={(e) => updateDebt(debt, { note: e.target.value.trim() || null })} />
              </div>
              <div className="button-row">
                <button className="mini-button" onClick={() => updateDebt(debt, { is_active: !debt.is_active })}>{debt.is_active ? "pausieren" : "aktivieren"}</button>
                <button className="mini-button danger" onClick={() => deleteDebt(debt)}>löschen</button>
              </div>
            </article>
          ))}
          {!debts.length && <p className="muted center">Leer.</p>}
        </section>

        <section className="form-card">
          <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Person / Sache" />
          <div className="grid-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as DebtKind)}>
              <option value="i_owe">ich schulde</option>
              <option value="owed_to_me">bei mir offen</option>
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
