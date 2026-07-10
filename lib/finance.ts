import type { Account, Transaction } from "./types";
import { supabase } from "./supabase";

export function parseAmount(value: string | number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = value.trim().replace(/\s/g, "").replace(/€/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function transactionDeltas(tx: Pick<Transaction, "type" | "amount" | "account_id" | "from_account_id" | "to_account_id">) {
  const amount = Number(tx.amount) || 0;
  const deltas = new Map<string, number>();
  const add = (id: string | null | undefined, delta: number) => {
    if (!id || !delta) return;
    deltas.set(id, (deltas.get(id) ?? 0) + delta);
  };

  if (tx.type === "expense") add(tx.account_id, -amount);
  if (tx.type === "income") add(tx.account_id, amount);
  if (tx.type === "transfer") {
    add(tx.from_account_id, -amount);
    add(tx.to_account_id, amount);
  }
  if (tx.type === "investment") {
    add(tx.from_account_id ?? tx.account_id, -amount);
    add(tx.to_account_id, amount);
  }

  return deltas;
}

export function invertDeltas(deltas: Map<string, number>) {
  return new Map(Array.from(deltas.entries()).map(([id, delta]) => [id, -delta]));
}

export function mergeDeltas(...maps: Map<string, number>[]) {
  const merged = new Map<string, number>();
  for (const map of maps) {
    for (const [id, delta] of map.entries()) merged.set(id, (merged.get(id) ?? 0) + delta);
  }
  return merged;
}

export async function applyDeltas(userId: string, accounts: Account[], deltas: Map<string, number>) {
  for (const [id, delta] of deltas.entries()) {
    const account = accounts.find((a) => a.id === id);
    if (!account) continue;
    const { error } = await supabase
      .from("accounts")
      .update({ balance: Number(account.balance) + delta })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  }
}

export function debtValue(debt: { amount: number | string; kind: string }) {
  const amount = Number(debt.amount) || 0;
  return debt.kind === "owed_to_me" ? amount : -amount;
}

export function debtNetValue(debts: { amount: number | string; kind: string }[]) {
  return debts.reduce((sum, debt) => sum + debtValue(debt), 0);
}

export function entryTypeLabel(type: string) {
  if (type === "expense") return "Ausgabe";
  if (type === "income") return "Einnahme";
  if (type === "transfer") return "Umbuchung";
  if (type === "investment") return "Investition";
  return type;
}


export const KEST_RATE = 0.275;

export function depotTax(balance: number, taxBase: number) {
  const gain = Number(balance || 0) - Number(taxBase || 0);
  return Math.max(0, gain * KEST_RATE);
}

export function depotNetValue(balance: number, taxBase: number) {
  return Number(balance || 0) - depotTax(balance, taxBase);
}

export function accountSortRank(account: Pick<Account, "type" | "name" | "created_at">) {
  const name = account.name.trim().toLowerCase();
  if (account.type === "active") {
    if (name === "n26") return 10;
    if (name.includes("bank austria") || name.includes("bankaustria")) return 20;
    if (name.includes("bargeld") || name.includes("cash")) return 30;
    return 40;
  }
  if (account.type === "investment") return 100;
  if (account.type === "bound") return 200;
  return 300;
}

export function sortAccountsStable<T extends Pick<Account, "type" | "name" | "created_at">>(accounts: T[]) {
  return [...accounts].sort((a, b) => {
    const rankDiff = accountSortRank(a) - accountSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    const createdDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.name.localeCompare(b.name, "de");
  });
}
