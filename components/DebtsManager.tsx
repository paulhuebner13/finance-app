"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { formatEuro, formatNumber, todayISO } from "@/lib/date";
import { parseAmount } from "@/lib/finance";
import { supabase } from "@/lib/supabase";
import type { Debt, DebtKind, Debtor } from "@/lib/types";
import { useSession } from "@/lib/useSession";

type Mode = "none" | "debt" | "debtor";

function debtValue(debt: Pick<Debt, "amount" | "kind">) {
  return debt.kind === "owed_to_me" ? Number(debt.amount) : -Number(debt.amount);
}

function dateLabel(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

export function DebtsManager() {
  const { session, loading } = useSession();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [mode, setMode] = useState<Mode>("none");
  const [expandedDebtor, setExpandedDebtor] = useState<string | null>(null);
  const [expandedStandalone, setExpandedStandalone] = useState<string | null>(null);

  const [newDebtorName, setNewDebtorName] = useState("");
  const [newDebtorKind, setNewDebtorKind] = useState<DebtKind>("i_owe");

  const [selectedDebtorId, setSelectedDebtorId] = useState<string>("");
  const [standaloneTitle, setStandaloneTitle] = useState("");
  const [newDebtKind, setNewDebtKind] = useState<DebtKind>("i_owe");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const [debtorsRes, debtsRes] = await Promise.all([
      supabase
        .from("debtors")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("debts")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
    ]);

    const nextDebtors = (debtorsRes.data ?? []) as Debtor[];
    const nextDebts = (debtsRes.data ?? []) as Debt[];
    setDebtors(nextDebtors);
    setDebts(nextDebts);

    if (!selectedDebtorId) {
      const defaultDebtor = nextDebtors.find((debtor) => debtor.is_default);
      if (defaultDebtor) {
        setSelectedDebtorId(defaultDebtor.id);
        setNewDebtKind(defaultDebtor.kind);
      }
    }
  }, [session?.user.id, selectedDebtorId]);

  useEffect(() => { load(); }, [load]);

  const net = useMemo(() => debts.reduce((sum, debt) => sum + debtValue(debt), 0), [debts]);

  const byDebtor = useMemo(() => {
    return debtors.map((debtor) => {
      const items = debts.filter((debt) => debt.debtor_id === debtor.id);
      const total = items.reduce((sum, debt) => sum + debtValue(debt), 0);
      return { debtor, items, total };
    });
  }, [debtors, debts]);

  const standaloneDebts = debts.filter((debt) => !debt.debtor_id);

  function startDebtForm() {
    const defaultDebtor = debtors.find((debtor) => debtor.is_default);
    if (defaultDebtor) {
      setSelectedDebtorId(defaultDebtor.id);
      setNewDebtKind(defaultDebtor.kind);
      setStandaloneTitle("");
    } else {
      setSelectedDebtorId("");
    }
    setAmount("");
    setDate(todayISO());
    setNote("");
    setMode(mode === "debt" ? "none" : "debt");
  }

  async function addDebtor() {
    if (!session?.user.id || !newDebtorName.trim()) return;
    await supabase.from("debtors").insert({
      user_id: session.user.id,
      name: newDebtorName.trim(),
      kind: newDebtorKind,
      is_default: debtors.length === 0,
      is_active: true
    });
    setNewDebtorName("");
    setNewDebtorKind("i_owe");
    setMode("none");
    await load();
  }

  async function addDebt() {
    if (!session?.user.id) return;
    const debtor = debtors.find((item) => item.id === selectedDebtorId);
    const kind = debtor ? debtor.kind : newDebtKind;
    const title = debtor ? debtor.name : standaloneTitle.trim();
    if (!title) return;
    await supabase.from("debts").insert({
      user_id: session.user.id,
      debtor_id: debtor?.id ?? null,
      person: title,
      amount: parseAmount(amount),
      kind,
      date,
      note: note.trim() || null,
      is_active: true
    });
    setAmount("");
    setNote("");
    setStandaloneTitle("");
    setDate(todayISO());
    setMode("none");
    await load();
  }

  async function updateDebt(debt: Debt, patch: Partial<Debt>) {
    if (!session?.user.id) return;
    setDebts((current) => current.map((item) => item.id === debt.id ? { ...item, ...patch } : item));
    await supabase.from("debts").update(patch).eq("id", debt.id).eq("user_id", session.user.id);
  }

  async function updateDebtor(debtor: Debtor, patch: Partial<Debtor>) {
    if (!session?.user.id) return;
    setDebtors((current) => current.map((item) => item.id === debtor.id ? { ...item, ...patch } : item));
    await supabase.from("debtors").update(patch).eq("id", debtor.id).eq("user_id", session.user.id);
    if (patch.kind) {
      await supabase.from("debts").update({ kind: patch.kind }).eq("debtor_id", debtor.id).eq("user_id", session.user.id);
      setDebts((current) => current.map((debt) => debt.debtor_id === debtor.id ? { ...debt, kind: patch.kind as DebtKind } : debt));
    }
  }

  async function setDefaultDebtor(debtor: Debtor) {
    if (!session?.user.id) return;
    await supabase.from("debtors").update({ is_default: false }).eq("user_id", session.user.id);
    await supabase.from("debtors").update({ is_default: true }).eq("id", debtor.id).eq("user_id", session.user.id);
    setSelectedDebtorId(debtor.id);
    setNewDebtKind(debtor.kind);
    await load();
  }

  async function deleteDebtor(debtor: Debtor) {
    if (!session?.user.id) return;
    await supabase.from("debts").update({ debtor_id: null }).eq("debtor_id", debtor.id).eq("user_id", session.user.id);
    await supabase.from("debtors").update({ is_active: false, is_default: false }).eq("id", debtor.id).eq("user_id", session.user.id);
    await load();
  }

  async function deleteDebt(debt: Debt) {
    if (!session?.user.id) return;
    await supabase.from("debts").delete().eq("id", debt.id).eq("user_id", session.user.id);
    await load();
  }

  function exportDebtor(debtor: Debtor, items: Debt[]) {
    const rows = [
      ["Datum", "Notiz", "Betrag"],
      ...items.map((debt) => [debt.date, debt.note ?? "", formatNumber(Number(debt.amount))])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${debtor.name.replace(/[^a-z0-9äöüß-]+/gi, "_")}_schulden.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard debts-page redesigned-debts-page">
        <section className="hero-card compact debts-total-card">
          <h1>{formatEuro(net)}</h1>
        </section>

        <section className="debt-action-grid">
          <button className="primary" onClick={startDebtForm}>Schulden hinzufügen</button>
          <button className="primary secondary-add" onClick={() => setMode(mode === "debtor" ? "none" : "debtor")}>Schuldner hinzufügen</button>
        </section>

        {mode === "debtor" && (
          <section className="form-card debt-form-card">
            <input value={newDebtorName} onChange={(e) => setNewDebtorName(e.target.value)} placeholder="Name" />
            <select value={newDebtorKind} onChange={(e) => setNewDebtorKind(e.target.value as DebtKind)}>
              <option value="i_owe">Schulde ich</option>
              <option value="owed_to_me">Schuldet mir</option>
            </select>
            <button className="primary" onClick={addDebtor}>Speichern</button>
          </section>
        )}

        {mode === "debt" && (
          <section className="form-card debt-form-card">
            <select
              value={selectedDebtorId}
              onChange={(e) => {
                const id = e.target.value;
                const debtor = debtors.find((item) => item.id === id);
                setSelectedDebtorId(id);
                if (debtor) setNewDebtKind(debtor.kind);
              }}
            >
              <option value="">Ohne Schuldner</option>
              {debtors.map((debtor) => (
                <option key={debtor.id} value={debtor.id}>{debtor.is_default ? "★ " : ""}{debtor.name}</option>
              ))}
            </select>
            {!selectedDebtorId && (
              <>
                <input value={standaloneTitle} onChange={(e) => setStandaloneTitle(e.target.value)} placeholder="Titel" />
                <select value={newDebtKind} onChange={(e) => setNewDebtKind(e.target.value as DebtKind)}>
                  <option value="i_owe">Schulde ich</option>
                  <option value="owed_to_me">Schuldet mir</option>
                </select>
              </>
            )}
            <div className="grid-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Betrag" />
              <input value={date} onChange={(e) => setDate(e.target.value)} type="date" />
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz" />
            <button className="primary" onClick={addDebt}>Speichern</button>
          </section>
        )}

        <section className="cards-stack compact-debt-stack">
          {byDebtor.map(({ debtor, items, total }) => {
            const isOpen = expandedDebtor === debtor.id;
            const positive = total >= 0;
            return (
              <article className="debt-person-card" key={debtor.id} style={{ ["--accent" as string]: positive ? "#2F855A" : "#C2410C" }}>
                <button className="debt-person-summary" onClick={() => setExpandedDebtor(isOpen ? null : debtor.id)}>
                  <span>{debtor.is_default ? "★ " : ""}{debtor.name}</span>
                  <b>{positive ? "+" : ""}{formatEuro(total)}</b>
                </button>

                {isOpen && (
                  <div className="debt-person-body">
                    <div className="debt-person-settings">
                      <input value={debtor.name} onChange={(e) => updateDebtor(debtor, { name: e.target.value })} />
                      <select value={debtor.kind} onChange={(e) => updateDebtor(debtor, { kind: e.target.value as DebtKind })}>
                        <option value="i_owe">Schulde ich</option>
                        <option value="owed_to_me">Schuldet mir</option>
                      </select>
                    </div>
                    <div className="button-row left-row">
                      <button className="mini-button" onClick={() => setDefaultDebtor(debtor)}>{debtor.is_default ? "Standard" : "als Standard"}</button>
                      <button className="mini-button" onClick={() => exportDebtor(debtor, items)}>Export</button>
                      <button className="mini-button danger" onClick={() => deleteDebtor(debtor)}>löschen</button>
                    </div>
                    <div className="debt-entry-list">
                      {items.map((debt) => (
                        <div className="debt-entry-row" key={debt.id}>
                          <div>
                            <strong>{dateLabel(debt.date)}</strong>
                            <span>{debt.note || "—"}</span>
                          </div>
                          <input inputMode="decimal" value={formatNumber(Number(debt.amount))} onChange={(e) => updateDebt(debt, { amount: parseAmount(e.target.value) })} />
                          <button className="mini-button danger" onClick={() => deleteDebt(debt)}>löschen</button>
                        </div>
                      ))}
                      {!items.length && <p className="muted small">Keine einzelnen Einträge.</p>}
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {standaloneDebts.map((debt) => {
            const isOpen = expandedStandalone === debt.id;
            const positive = debt.kind === "owed_to_me";
            return (
              <article className="debt-person-card standalone-debt-card" key={debt.id} style={{ ["--accent" as string]: positive ? "#2F855A" : "#C2410C" }}>
                <button className="debt-person-summary" onClick={() => setExpandedStandalone(isOpen ? null : debt.id)}>
                  <span>{debt.person}</span>
                  <b>{positive ? "+" : "−"}{formatEuro(Number(debt.amount))}</b>
                </button>
                {isOpen && (
                  <div className="debt-person-body">
                    <input value={debt.person} onChange={(e) => updateDebt(debt, { person: e.target.value })} />
                    <select value={debt.kind} onChange={(e) => updateDebt(debt, { kind: e.target.value as DebtKind })}>
                      <option value="i_owe">Schulde ich</option>
                      <option value="owed_to_me">Schuldet mir</option>
                    </select>
                    <div className="grid-2">
                      <input inputMode="decimal" value={formatNumber(Number(debt.amount))} onChange={(e) => updateDebt(debt, { amount: parseAmount(e.target.value) })} />
                      <input type="date" value={debt.date} onChange={(e) => updateDebt(debt, { date: e.target.value })} />
                    </div>
                    <input value={debt.note ?? ""} onChange={(e) => updateDebt(debt, { note: e.target.value || null })} placeholder="Notiz" />
                    <button className="mini-button danger" onClick={() => deleteDebt(debt)}>löschen</button>
                  </div>
                )}
              </article>
            );
          })}

          {!debtors.length && !standaloneDebts.length && <p className="muted center">Leer.</p>}
        </section>
      </main>
    </AppShell>
  );
}
