"use client";

import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";

export function ProfilePage() {
  const { session, loading } = useSession();

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) return <main className="loading-page">Laden...</main>;
  if (!session) return <AuthGate />;

  return (
    <AppShell>
      <main className="dashboard profile-page">
        <section className="hero-card compact profile-card">
          <h1>Profil</h1>
          <p>{session.user.email}</p>
        </section>

        <section className="form-card">
          <button className="mini-button danger logout-button" onClick={signOut}>Logout</button>
        </section>
      </main>
    </AppShell>
  );
}
