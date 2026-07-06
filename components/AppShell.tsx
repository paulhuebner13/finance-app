"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const nav = [
  { href: "/", label: "Start" },
  { href: "/transactions", label: "Buchungen" },
  { href: "/wealth", label: "Geld" },
  { href: "/accounts", label: "Konten" },
  { href: "/categories", label: "Budgets" },
  { href: "/recurring", label: "Regeln" },
  { href: "/investments", label: "Depot" },
  { href: "/analysis", label: "Analyse" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">Finance</Link>
        <button className="ghost" onClick={signOut}>Logout</button>
      </header>
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
