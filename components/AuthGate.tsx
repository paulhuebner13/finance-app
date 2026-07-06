"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function AuthGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setMessage("");

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup") {
      setMessage("Account erstellt. Falls E-Mail-Bestätigung aktiv ist: bitte Mail bestätigen und dann einloggen.");
      return;
    }

    window.location.reload();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div>
          <p className="eyebrow">Finance App</p>
          <h1>Deine Finanzen privat tracken.</h1>
          <p className="muted">Login schützt deine Daten. Supabase RLS sorgt dafür, dass jeder User nur eigene Buchungen sieht.</p>
        </div>

        <label>
          E-Mail
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@example.com" type="email" />
        </label>

        <label>
          Passwort
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mindestens 6 Zeichen" type="password" />
        </label>

        <button className="primary" onClick={submit} disabled={loading || !email || !password}>
          {loading ? "Bitte warten..." : mode === "login" ? "Einloggen" : "Konto erstellen"}
        </button>

        <button className="text-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Noch kein Konto? Konto erstellen" : "Schon ein Konto? Einloggen"}
        </button>

        {message && <p className="notice">{message}</p>}
      </section>
    </main>
  );
}
