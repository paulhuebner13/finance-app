"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { categoryColors } from "@/lib/defaults";
import { formatEuro } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Category, CategoryGroup, CategoryKind, CategoryWithChildren } from "@/lib/types";
import { useSession } from "@/lib/useSession";

export function CategoriesManager() {
  const { session, loading } = useSession();
  const [groups, setGroups] = useState<CategoryWithChildren[]>([]);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CategoryKind>("expense");
  const [newBudget, setNewBudget] = useState("");

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const [groupsRes, categoriesRes] = await Promise.all([
      supabase.from("category_groups").select("*").eq("user_id", session.user.id).order("sort_order"),
      supabase.from("categories").select("*").eq("user_id", session.user.id).order("sort_order")
    ]);
    const categoryRows = (categoriesRes.data ?? []) as Category[];
    const groupRows = (groupsRes.data ?? []) as CategoryGroup[];
    setGroups(groupRows.map((group) => ({ ...group, categories: categoryRows.filter((category) => category.group_id === group.id) })));
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);

  async function addGroup() {
    if (!session?.user.id || !newName.trim()) return;
    const color = categoryColors[groups.length % categoryColors.length];
    const { data } = await supabase.from("category_groups").insert({
      user_id: session.user.id,
      kind: newKind,
      name: newName.trim(),
      average_monthly_budget: Number(newBudget.replace(",", ".")) || 0,
      color,
      sort_order: groups.length
    }).select("id").single();

    if (data?.id) {
      await supabase.from("categories").insert({ user_id: session.user.id, group_id: data.id, name: "Sonstiges", sort_order: 0 });
    }
    setNewName("");
    setNewBudget("");
    await load();
  }

  async function updateGroup(group: CategoryGroup, patch: Partial<CategoryGroup>) {
    if (!session?.user.id) return;
    await supabase.from("category_groups").update(patch).eq("id", group.id).eq("user_id", session.user.id);
    await load();
  }

  async function addSubcategory(group: CategoryWithChildren) {
    if (!session?.user.id) return;
    const name = window.prompt(`Neue Unterkategorie für ${group.name}`);
    if (!name?.trim()) return;
    await supabase.from("categories").insert({
      user_id: session.user.id,
      group_id: group.id,
      name: name.trim(),
      sort_order: group.categories.length
    });
    await load();
  }

  async function renameCategory(category: Category) {
    if (!session?.user.id) return;
    const name = window.prompt("Unterkategorie umbenennen", category.name);
    if (!name?.trim()) return;
    await supabase.from("categories").update({ name: name.trim() }).eq("id", category.id).eq("user_id", session.user.id);
    await load();
  }

  async function toggleCategory(category: Category) {
    if (!session?.user.id) return;
    await supabase.from("categories").update({ is_active: !category.is_active }).eq("id", category.id).eq("user_id", session.user.id);
    await load();
  }

  async function deactivateGroup(group: CategoryGroup) {
    if (!session?.user.id) return;
    const ok = window.confirm(`${group.name} deaktivieren? Bestehende Buchungen bleiben erhalten.`);
    if (!ok) return;
    await supabase.from("category_groups").update({ is_active: false }).eq("id", group.id).eq("user_id", session.user.id);
    await load();
  }

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="hero-card compact">
          <h1>Plan einstellen</h1>
          <p className="muted">Budget ist ein Durchschnittsmonat. Die App rechnet intern auf Tagesbudget und echte Monatslänge runter.</p>
        </section>

        <section className="form-card">
          <h2>Neue Gruppe</h2>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. Reisen" />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as CategoryKind)}>
            <option value="expense">Ausgabe</option>
            <option value="income">Einnahme</option>
            <option value="investment">Investieren</option>
          </select>
          <input value={newBudget} onChange={(e) => setNewBudget(e.target.value)} inputMode="decimal" placeholder="Durchschnittsbudget pro Monat" />
          <button className="primary" onClick={addGroup}>Hinzufügen</button>
        </section>

        <section className="cards-stack">
          {groups.map((group) => (
            <article className="category-edit-card" key={group.id} style={{ ["--accent" as string]: group.color }}>
              <div className="budget-card-header">
                <div>
                  <input className="plain-input" value={group.name} onChange={(e) => updateGroup(group, { name: e.target.value })} />
                  <p className="muted small">{group.kind} · {group.is_active ? "aktiv" : "inaktiv"} · Durchschnitt: {formatEuro(Number(group.average_monthly_budget))}</p>
                </div>
                <input
                  className="budget-input"
                  inputMode="decimal"
                  value={String(group.average_monthly_budget)}
                  onChange={(e) => updateGroup(group, { average_monthly_budget: Number(e.target.value.replace(",", ".")) || 0 })}
                />
              </div>

              <div className="subchips">
                {group.categories.map((category) => (
                  <button key={category.id} className={!category.is_active ? "disabled-chip" : ""} onClick={() => renameCategory(category)} onContextMenu={(e) => { e.preventDefault(); toggleCategory(category); }} title="Klick = umbenennen, Rechtsklick = aktiv/inaktiv">
                    {category.name}{!category.is_active ? " (inaktiv)" : ""}
                  </button>
                ))}
                <button className="add-chip" onClick={() => addSubcategory(group)}>+ Unterkategorie</button>
                {group.is_active ? <button className="danger-chip" onClick={() => deactivateGroup(group)}>deaktivieren</button> : <button className="add-chip" onClick={() => updateGroup(group, { is_active: true })}>reaktivieren</button>}
              </div>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
