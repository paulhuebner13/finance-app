export type EntryType = "expense" | "income" | "transfer" | "investment";
export type CategoryKind = "expense" | "income" | "investment";
export type AccountType = "active" | "bound" | "investment";

export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  include_in_available_net_worth: boolean;
  is_default: boolean;
  balance: number;
  color: string;
  is_active: boolean;
  created_at: string;
};

export type CategoryGroup = {
  id: string;
  user_id: string;
  kind: CategoryKind;
  name: string;
  average_monthly_budget: number;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  group_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: EntryType;
  amount: number;
  date: string;
  account_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  group_id: string | null;
  category_id: string | null;
  note: string | null;
  created_at: string;
};

export type RecurringTransaction = {
  id: string;
  user_id: string;
  type: EntryType;
  amount: number;
  account_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  group_id: string | null;
  category_id: string | null;
  note: string | null;
  day_of_month: number;
  active: boolean;
  last_created_month: string | null;
  created_at: string;
};

export type MonthClosing = {
  id: string;
  user_id: string;
  month: string;
  closed_at: string;
};

export type CategoryWithChildren = CategoryGroup & {
  categories: Category[];
};
