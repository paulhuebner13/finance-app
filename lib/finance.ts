import type { Account, Transaction } from "./types";
import { supabase } from "./supabase";

export function parseAmount(value: string | number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = value.replace(/\s/g, "").replace("€", "").replace(",", ".");
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

export function entryTypeLabel(type: string) {
  if (type === "expense") return "Ausgabe";
  if (type === "income") return "Einnahme";
  if (type === "transfer") return "Umbuchung";
  if (type === "investment") return "Investition";
  return type;
}
