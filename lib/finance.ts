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


export function accountCountsForAusgehen(account: Pick<Account, "type" | "include_in_available_net_worth">) {
  return account.type === "active" && account.include_in_available_net_worth;
}

export function accountComparableTotal(accounts: Pick<Account, "type" | "include_in_available_net_worth" | "balance">[]) {
  return accounts
    .filter(accountCountsForAusgehen)
    .reduce((sum, account) => sum + Number(account.balance || 0), 0);
}

export function accountIsComparable(account: Pick<Account, "type" | "include_in_available_net_worth"> | null | undefined) {
  return !!account && account.type === "active" && account.include_in_available_net_worth;
}

export function transactionComparableEffect(
  tx: Pick<Transaction, "type" | "amount" | "account_id" | "from_account_id" | "to_account_id" | "group_id">,
  accounts: Pick<Account, "id" | "type" | "include_in_available_net_worth">[],
  outingGroupId?: string | null
) {
  if (tx.type === "expense" && outingGroupId && tx.group_id === outingGroupId) return 0;
  const amount = Number(tx.amount) || 0;
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const isComparable = (id: string | null | undefined) => accountIsComparable(id ? accountById.get(id) : null);

  if (tx.type === "income") return isComparable(tx.account_id) ? amount : 0;
  if (tx.type === "expense") return isComparable(tx.account_id) ? -amount : 0;
  if (tx.type === "transfer") {
    return (isComparable(tx.to_account_id) ? amount : 0) - (isComparable(tx.from_account_id) ? amount : 0);
  }
  if (tx.type === "investment") {
    return (isComparable(tx.to_account_id) ? amount : 0) - (isComparable(tx.from_account_id ?? tx.account_id) ? amount : 0);
  }
  return 0;
}

export function trackedComparableChange(input: {
  transactions: Pick<Transaction, "type" | "amount" | "account_id" | "from_account_id" | "to_account_id" | "group_id">[];
  accounts: Pick<Account, "id" | "type" | "include_in_available_net_worth">[];
  outingGroupId?: string | null;
}) {
  return input.transactions.reduce(
    (sum, tx) => sum + transactionComparableEffect(tx, input.accounts, input.outingGroupId),
    0
  );
}

export function calculateOutingValue(input: {
  openingComparable: number | null | undefined;
  currentComparable: number | null | undefined;
  trackedComparableChange: number;
}) {
  if (input.openingComparable === null || input.openingComparable === undefined) return 0;
  if (input.currentComparable === null || input.currentComparable === undefined) return 0;
  return (
    Number(input.openingComparable || 0)
    + Number(input.trackedComparableChange || 0)
    - Number(input.currentComparable || 0)
  );
}

export function comparableValue(accounts: Pick<Account, "type" | "include_in_available_net_worth" | "balance">[], debts: { amount: number | string; kind: string }[]) {
  return accountComparableTotal(accounts) + debtNetValue(debts);
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

export function categoryAccent(name: string, fallback = "#256f84") {
  const key = name.trim().toLowerCase();
  if (key.includes("wohnen")) return "#f97316";
  if (key === "leben" || key.includes("lebens")) return "#eab308";
  if (key.includes("mobil")) return "#22c55e";
  if (key.includes("kommunikation") || key.includes("abos")) return "#3258a8";
  if (key.includes("versicher")) return "#8b5cf6";
  if (key.includes("notwend")) return "#14b8a6";
  if (key.includes("freizeit")) return "#facc15";
  if (key.includes("ausgehen")) return "#ef4444";
  if (key.includes("einnah")) return "#16a34a";
  if (key.includes("invest")) return "#6254c7";
  return fallback;
}

export function categoryAccentSoft(name: string, fallback = "#256f84") {
  return categoryAccent(name, fallback);
}
