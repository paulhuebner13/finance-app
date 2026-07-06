import type { AccountType, BudgetPeriod, CategoryKind } from "./types";

export const categoryColors = [
  "#7C3AED",
  "#0891B2",
  "#16A34A",
  "#EA580C",
  "#DB2777",
  "#CA8A04",
  "#0284C7",
  "#9333EA",
  "#0D9488"
];

export const defaultAccounts: Array<{
  name: string;
  type: AccountType;
  include_in_available_net_worth: boolean;
  is_default?: boolean;
  balance: number;
  color: string;
}> = [
  { name: "N26", type: "active", include_in_available_net_worth: true, is_default: true, balance: 0, color: "#0EA5E9" },
  { name: "Bank Austria", type: "active", include_in_available_net_worth: true, is_default: false, balance: 0, color: "#EF4444" },
  { name: "Bargeld", type: "active", include_in_available_net_worth: true, is_default: false, balance: 0, color: "#22C55E" },
  { name: "Kaution Wohnung", type: "bound", include_in_available_net_worth: false, is_default: false, balance: 0, color: "#F59E0B" },
  { name: "Scalable Capital", type: "investment", include_in_available_net_worth: false, is_default: false, balance: 0, color: "#A855F7" }
];

type DefaultCategory = {
  name: string;
  average_monthly_budget: number;
  budget_period?: BudgetPeriod;
};

const c = (name: string, average_monthly_budget = 0, budget_period: BudgetPeriod = "daily"): DefaultCategory => ({ name, average_monthly_budget, budget_period });

export const defaultCategoryGroups: Array<{
  kind: CategoryKind;
  name: string;
  average_monthly_budget: number;
  budget_period: BudgetPeriod;
  color: string;
  categories: DefaultCategory[];
}> = [
  { kind: "expense", name: "Wohnen", average_monthly_budget: 700, budget_period: "monthly", color: "#7C3AED", categories: [c("Miete", 600, "monthly"), c("Strom", 35, "monthly"), c("Heizung", 30, "monthly"), c("Wasser", 15, "monthly"), c("Internet", 20, "monthly"), c("Sonstiges", 0, "monthly")] },
  { kind: "expense", name: "Leben", average_monthly_budget: 550, budget_period: "daily", color: "#0891B2", categories: [c("Lebensmittel", 300), c("Essen", 120), c("Drogerie", 45), c("Friseur", 25, "monthly"), c("Gesundheit", 40), c("Haushalt", 20), c("Sonstiges", 0)] },
  { kind: "expense", name: "Mobilität", average_monthly_budget: 80, budget_period: "daily", color: "#16A34A", categories: [c("Jahreskarte", 40, "monthly"), c("Öffis", 10), c("Taxi/Uber", 15), c("Bahn", 15), c("Flug", 0), c("Sonstiges", 0)] },
  { kind: "expense", name: "Kommunikation & Abos", average_monthly_budget: 120, budget_period: "monthly", color: "#EA580C", categories: [c("Handy", 0, "monthly"), c("Handyvertrag", 20, "monthly"), c("Laptop/Elektronik", 25), c("Spotify", 11, "monthly"), c("Google", 3, "monthly"), c("ChatGPT", 23, "monthly"), c("F1", 7, "monthly"), c("Sonstiges", 0, "monthly")] },
  { kind: "expense", name: "Versicherungen", average_monthly_budget: 80, budget_period: "monthly", color: "#DB2777", categories: [c("Berufsunfähigkeit", 50, "monthly"), c("Zusatzversicherung", 30, "monthly"), c("Haftpflicht", 0, "monthly"), c("Sonstiges", 0, "monthly")] },
  { kind: "expense", name: "Notwendigkeiten", average_monthly_budget: 250, budget_period: "daily", color: "#CA8A04", categories: [c("Kleidung", 60), c("Gym", 35, "monthly"), c("Sport", 35), c("Geschenke", 40), c("Anschaffungen", 60), c("TC", 20, "monthly"), c("Sonstiges", 0)] },
  { kind: "expense", name: "Freizeit", average_monthly_budget: 300, budget_period: "daily", color: "#0284C7", categories: [c("Aktivitäten", 60), c("Urlaub", 80), c("Tickets", 35), c("Restaurant", 80), c("Wetten", 20), c("Sonstiges", 25)] },
  { kind: "expense", name: "Ausgehen", average_monthly_budget: 250, budget_period: "daily", color: "#F97316", categories: [] },
  { kind: "investment", name: "Investieren", average_monthly_budget: 300, budget_period: "monthly", color: "#9333EA", categories: [c("ETF", 300, "monthly"), c("Aktien", 0, "monthly"), c("Krypto", 0, "monthly"), c("Tagesgeld", 0, "monthly"), c("Sparkonto", 0, "monthly"), c("Sonstiges", 0, "monthly")] },
  { kind: "income", name: "Einnahmen", average_monthly_budget: 0, budget_period: "monthly", color: "#0D9488", categories: [c("Gehalt", 0, "monthly"), c("Taschengeld", 0, "monthly"), c("Nebenjob", 0, "monthly"), c("Rückzahlung", 0, "monthly"), c("Geschenk", 0, "monthly"), c("Sonstiges", 0, "monthly")] }
];
