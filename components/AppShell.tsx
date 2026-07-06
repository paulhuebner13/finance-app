"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Start" },
  { href: "/transactions", label: "Buchungen" },
  { href: "/wealth", label: "Geld" },
  { href: "/debts", label: "Schulden" },
  { href: "/accounts", label: "Konten" },
  { href: "/categories", label: "Budgets" },
  { href: "/recurring", label: "Regeln" },
  { href: "/investments", label: "Depot" },
  { href: "/analysis", label: "Analyse" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell no-topbar">
      <div className="page-wrap">{children}</div>
      <nav className="bottom-nav">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
