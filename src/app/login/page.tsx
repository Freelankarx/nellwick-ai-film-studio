"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Film } from "lucide-react";

function getSafeNextPath(): string {
  const value = new URLSearchParams(window.location.search).get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }

  const target = new URL(value, window.location.origin);
  return target.origin === window.location.origin && target.pathname !== "/login"
    ? `${target.pathname}${target.search}${target.hash}`
    : "/";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "supabase_not_configured") {
      setMessage(
        "The studio cannot reach Supabase because its public URL or publishable key is missing from this deployment. Check the Vercel environment variables.",
      );
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const supabase = createClient();
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/login`,
              },
            });

      if (result.error) throw result.error;

      if (mode === "signup" && !result.data.session) {
        setMessage("Your account was created. Check your email to confirm it, then sign in.");
        setMode("signin");
        return;
      }

      // A full navigation ensures the newly written Supabase cookies are sent
      // through middleware before the requested studio page renders.
      window.location.assign(getSafeNextPath());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication failed. Check your Supabase configuration.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand" style={{ padding: 0, marginBottom: 28 }}>
          <div className="brand-mark"><Film size={20} /></div>
          <div>
            <div className="brand-name">NELLWICK</div>
            <div className="brand-sub">AI FILM STUDIO</div>
          </div>
        </div>

        <div className="eyebrow">PRIVATE CREATIVE WORKSPACE</div>
        <h1 className="page-title" style={{ fontSize: 25 }}>
          {mode === "signin" ? "Welcome back" : "Create your studio account"}
        </h1>
        <p className="page-subtitle" style={{ marginBottom: 22 }}>
          Sign in to manage your film projects, media and production workers.
        </p>

        <form className="form-grid" onSubmit={submit}>
          <label className="field-label">
            Email
            <input
              className="field"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Password
            <input
              className="field"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>
          {message && <div className="notice" role="status">{message}</div>}
          <button
            className="primary-btn"
            disabled={busy}
            style={{ justifyContent: "center" }}
          >
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <p style={{ fontSize: 10, color: "#9aa6b8", marginTop: 18, textAlign: "center" }}>
          {mode === "signin" ? "Don't have an account?" : "Already registered?"}{" "}
          <button
            type="button"
            style={{ color: "#b5aaff", background: "none", border: 0, cursor: "pointer" }}
            onClick={() => {
              setMessage("");
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
