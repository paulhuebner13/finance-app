"use client";

import { useState } from "react";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

export function AuthGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setMessage("");

    const normalizedEmail = cleanEmail(email);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

        if (error) {
          setMessage(error.message === "Invalid login credentials" ? "E-Mail oder Passwort passt nicht." : error.message);
          return;
        }

        window.location.reload();
        return;
      }

      const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });

      if (error) {
        setMessage(error.message === "User already registered" ? "Konto gibt es schon. Bitte einloggen." : error.message);
        return;
      }

      if (data.session) {
        window.location.reload();
        return;
      }

      setMessage("Konto erstellt. Supabase wartet noch auf E-Mail-Bestätigung.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Verbindung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div>
          <h1>Finance</h1>
        </div>

        {!hasSupabaseConfig && <p className="error">Supabase fehlt.</p>}

        <label>
          E-Mail
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@example.com" type="email" />
        </label>

        <label>
          Passwort
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passwort" type="password" />
        </label>

        <button className="primary" onClick={submit} disabled={loading || !email.trim() || !password || !hasSupabaseConfig}>
          {loading ? "..." : mode === "login" ? "Einloggen" : "Konto erstellen"}
        </button>

        <button className="text-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Konto erstellen" : "Einloggen"}
        </button>

        {message && <p className="notice">{message}</p>}
      </section>
    </main>
  );
}
