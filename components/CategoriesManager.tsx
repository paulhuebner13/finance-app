"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { categoryColors } from "@/lib/defaults";
import { formatEuro } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { BudgetPeriod, Category, CategoryGroup, CategoryKind, CategoryWithChildren } from "@/lib/types";
import { useSession } from "@/lib/useSession";

function parseBudget(value: string | number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function childBudgetSum(group: CategoryWithChildren) {
  return group.categories.filter((category) => category.is_active).reduce((sum, category) => sum + Number(category.average_monthly_budget), 0);
}

export function CategoriesManager() {
  const { session, loading } = useSession();
  const [groups, setGroups] = useState<CategoryWithChildren[]>([]);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CategoryKind>("expense");
  const [newPeriod, setNewPeriod] = useState<BudgetPeriod>("daily");

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

  const totalExpenseBudget = useMemo(() => groups.filter((g) => g.kind === "expense" && g.is_active).reduce((sum, group) => sum + childBudgetSum(group), 0), [groups]);

  async function syncGroupBudget(group: CategoryWithChildren, nextCategories?: Category[]) {
    if (!session?.user.id) return;
    const categories = nextCategories ?? group.categories;
    const sum = categories.filter((c) => c.is_active).reduce((total, c) => total + Number(c.average_monthly_budget), 0);
    await supabase.from("category_groups").update({ average_monthly_budget: sum }).eq("id", group.id).eq("user_id", session.user.id);
  }

  async function addGroup() {
    if (!session?.user.id || !newName.trim()) return;
    const color = categoryColors[groups.length % categoryColors.length];
    const { data } = await supabase.from("category_groups").insert({
      user_id: session.user.id,
      kind: newKind,
      name: newName.trim(),
      average_monthly_budget: 0,
      budget_period: newPeriod,
      color,
      sort_order: groups.length
    }).select("id").single();

    if (data?.id) {
      await supabase.from("categories").insert({
        user_id: session.user.id,
        group_id: data.id,
        name: "Sonstiges",
        average_monthly_budget: 0,
        budget_period: newPeriod,
        sort_order: 0
      });
    }
    setNewName("");
    await load();
  }

  async function updateGroup(group: CategoryWithChildren, patch: Partial<CategoryGroup>) {
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
      average_monthly_budget: 0,
      budget_period: group.budget_period,
      sort_order: group.categories.length
    });
    await load();
  }

  async function updateCategory(group: CategoryWithChildren, category: Category, patch: Partial<Category>) {
    if (!session?.user.id) return;
    const nextCategory = { ...category, ...patch };
    const nextCategories = group.categories.map((item) => item.id === category.id ? nextCategory : item);
    await supabase.from("categories").update(patch).eq("id", category.id).eq("user_id", session.user.id);
    await syncGroupBudget(group, nextCategories);
    await load();
  }

  async function toggleCategory(group: CategoryWithChildren, category: Category) {
    await updateCategory(group, category, { is_active: !category.is_active });
  }

  async function deactivateGroup(group: CategoryWithChildren) {
    if (!session?.user.id) return;
    await supabase.from("category_groups").update({ is_active: false }).eq("id", group.id).eq("user_id", session.user.id);
    await load();
  }

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard">
        <section className="hero-card compact">
          <h1>{formatEuro(totalExpenseBudget)}</h1>
        </section>

        <section className="form-card">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Neue Gruppe" />
          <div className="grid-2">
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as CategoryKind)}>
              <option value="expense">Ausgabe</option>
              <option value="income">Einnahme</option>
              <option value="investment">Investieren</option>
            </select>
            <select value={newPeriod} onChange={(e) => setNewPeriod(e.target.value as BudgetPeriod)}>
              <option value="daily">täglich</option>
              <option value="monthly">monatlich</option>
            </select>
          </div>
          <button className="primary" onClick={addGroup}>Hinzufügen</button>
        </section>

        <section className="cards-stack">
          {groups.map((group) => {
            const effective = childBudgetSum(group);
            return (
              <article className="category-edit-card" key={group.id} style={{ ["--accent" as string]: group.color }}>
                <div className="budget-card-header">
                  <div>
                    <input className="plain-input" defaultValue={group.name} onBlur={(e) => e.target.value.trim() && updateGroup(group, { name: e.target.value.trim() })} />
                    <p className="muted small">{formatEuro(effective)}</p>
                  </div>
                  <select className="group-period-select" value={group.budget_period} onChange={(e) => updateGroup(group, { budget_period: e.target.value as BudgetPeriod })}>
                    <option value="daily">täglich</option>
                    <option value="monthly">monatlich</option>
                  </select>
                </div>

                <div className="subcategory-edit-list">
                  {group.categories.map((category) => (
                    <div className={`subcategory-edit-row ${!category.is_active ? "is-disabled" : ""}`} key={category.id}>
                      <input className="plain-input" defaultValue={category.name} onBlur={(e) => e.target.value.trim() && updateCategory(group, category, { name: e.target.value.trim() })} />
                      <input className="budget-input" inputMode="decimal" defaultValue={String(category.average_monthly_budget)} onBlur={(e) => updateCategory(group, category, { average_monthly_budget: parseBudget(e.target.value) })} />
                      <select value={category.budget_period} onChange={(e) => updateCategory(group, category, { budget_period: e.target.value as BudgetPeriod })}>
                        <option value="daily">täglich</option>
                        <option value="monthly">monatlich</option>
                      </select>
                      <button className="mini-button" onClick={() => toggleCategory(group, category)}>{category.is_active ? "aus" : "an"}</button>
                    </div>
                  ))}
                </div>

                <div className="subchips">
                  <button className="add-chip" onClick={() => addSubcategory(group)}>+ Untergruppe</button>
                  {group.is_active ? <button className="danger-chip" onClick={() => deactivateGroup(group)}>deaktivieren</button> : <button className="add-chip" onClick={() => updateGroup(group, { is_active: true })}>reaktivieren</button>}
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </AppShell>
  );
}
