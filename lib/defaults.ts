import type { AccountType, CategoryKind } from "./types";

export const categoryColors = [
  "#8B5CF6",
  "#06B6D4",
  "#22C55E",
  "#F97316",
  "#EC4899",
  "#EAB308",
  "#38BDF8",
  "#A855F7",
  "#14B8A6"
];

export const defaultAccounts: Array<{
  name: string;
  type: AccountType;
  include_in_available_net_worth: boolean;
  is_default?: boolean;
  balance: number;
  color: string;
}> = [
  { name: "N26", type: "active", include_in_available_net_worth: true, is_default: true, balance: 0, color: "#38BDF8" },
  { name: "Bank Austria", type: "active", include_in_available_net_worth: true, is_default: false, balance: 0, color: "#EF4444" },
  { name: "Bargeld", type: "active", include_in_available_net_worth: true, is_default: false, balance: 0, color: "#22C55E" },
  { name: "Kaution Wohnung", type: "bound", include_in_available_net_worth: false, is_default: false, balance: 0, color: "#F59E0B" },
  { name: "Scalable Capital", type: "investment", include_in_available_net_worth: false, is_default: false, balance: 0, color: "#A855F7" }
];

export const defaultCategoryGroups: Array<{
  kind: CategoryKind;
  name: string;
  average_monthly_budget: number;
  color: string;
  categories: string[];
}> = [
  { kind: "expense", name: "Wohnen", average_monthly_budget: 700, color: "#8B5CF6", categories: ["Miete", "Strom", "Heizung", "Wasser", "Internet", "Sonstiges"] },
  { kind: "expense", name: "Leben", average_monthly_budget: 550, color: "#06B6D4", categories: ["Lebensmittel", "Essen", "Drogerie", "Friseur", "Gesundheit", "Haushalt", "Sonstiges"] },
  { kind: "expense", name: "Mobilität", average_monthly_budget: 80, color: "#22C55E", categories: ["Jahreskarte", "Öffis", "Taxi/Uber", "Bahn", "Flug", "Sonstiges"] },
  { kind: "expense", name: "Kommunikation & Abos", average_monthly_budget: 120, color: "#F97316", categories: ["Handy", "Handyvertrag", "Laptop/Elektronik", "Spotify", "Google", "ChatGPT", "F1", "Sonstiges"] },
  { kind: "expense", name: "Versicherungen", average_monthly_budget: 80, color: "#EC4899", categories: ["Berufsunfähigkeit", "Zusatzversicherung", "Haftpflicht", "Sonstiges"] },
  { kind: "expense", name: "Notwendigkeiten", average_monthly_budget: 250, color: "#EAB308", categories: ["Kleidung", "Gym", "Sport", "Geschenke", "Anschaffungen", "TC", "Sonstiges"] },
  { kind: "expense", name: "Freizeit", average_monthly_budget: 300, color: "#38BDF8", categories: ["Aktivitäten", "Urlaub", "Tickets", "Restaurant", "Wetten", "Sonstiges"] },
  { kind: "investment", name: "Investieren", average_monthly_budget: 300, color: "#A855F7", categories: ["ETF", "Aktien", "Krypto", "Tagesgeld", "Sparkonto", "Sonstiges"] },
  { kind: "income", name: "Einnahmen", average_monthly_budget: 0, color: "#14B8A6", categories: ["Gehalt", "Taschengeld", "Nebenjob", "Rückzahlung", "Geschenk", "Sonstiges"] }
];
