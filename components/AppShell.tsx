"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const nav = [
  { href: "/", label: "Start" },
  { href: "/accounts", label: "Konten" },
  { href: "/debts", label: "Schulden" },
  { href: "/wealth", label: "Geld" },
  { href: "/transactions", label: "Buchungen" },
  { href: "/closings", label: "Abrechnung" },
  { href: "/recurring", label: "Regeln" },
  { href: "/categories", label: "Budgets" },
  { href: "/analysis", label: "Analyse" },
  { href: "/investments", label: "Depot" },
  { href: "/profile", label: "Profil" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;
    const saved = Number(sessionStorage.getItem("finance-bottom-nav-scroll") ?? 0);
    navEl.scrollLeft = saved;
  }, [pathname]);

  useEffect(() => {
    function selectAmountInput(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const isAmountInput =
        target.inputMode === "decimal" ||
        target.inputMode === "numeric" ||
        target.type === "number" ||
        target.dataset.selectAmount === "true";

      if (!isAmountInput) return;

      window.setTimeout(() => {
        if (document.activeElement === target) target.select();
      }, 0);
    }

    document.addEventListener("focusin", selectAmountInput);
    return () => document.removeEventListener("focusin", selectAmountInput);
  }, []);

  function rememberScroll() {
    const navEl = navRef.current;
    if (!navEl) return;
    sessionStorage.setItem("finance-bottom-nav-scroll", String(navEl.scrollLeft));
  }

  return (
    <div className="app-shell no-topbar">
      <div className="page-wrap">{children}</div>
      <nav className="bottom-nav" ref={navRef} onScroll={rememberScroll}>
        {nav.map((item) => (
          <Link key={item.href} href={item.href} scroll={false} className={pathname === item.href ? "active" : ""} onClick={rememberScroll}>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
