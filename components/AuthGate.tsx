"use client";

import { useState } from "react";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export function AuthGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setMessage("");

    try {
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      if (mode === "signup") {
        setMessage("Erstellt. Jetzt einloggen.");
        return;
      }

      window.location.reload();
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

        <button className="primary" onClick={submit} disabled={loading || !email || !password || !hasSupabaseConfig}>
          {loading ? "Bitte warten..." : mode === "login" ? "Einloggen" : "Konto erstellen"}
        </button>

        <button className="text-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Konto erstellen" : "Einloggen"}
        </button>

        {message && <p className="notice">{message}</p>}
      </section>
    </main>
  );
}
