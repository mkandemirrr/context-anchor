"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const handleAppleLogin = async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.authGlow} />
      <div className={styles.authCard}>
        <div className={styles.authLogo}>
          <span className={styles.authLogoIcon}>⚓</span>
          <span className={`${styles.authLogoText} text-gradient`}>
            ContextAnchor
          </span>
        </div>

        <h1 className={styles.authTitle}>Welcome Back</h1>
        <p className={styles.authSubtitle}>
          Log in to continue your grounded AI sessions
        </p>

        <button className={styles.authSocialBtn} onClick={handleAppleLogin}>
          <span className={styles.authSocialIcon}></span>
          Continue with Apple
        </button>

        <div className={styles.authDivider}>
          <span className={styles.authDividerLine} />
          <span>or</span>
          <span className={styles.authDividerLine} />
        </div>

        {error && (
          <div className={styles.authError}>
            ⚠️ {error}
          </div>
        )}

        <form className={styles.authForm} onSubmit={handleLogin}>
          <div className={styles.authField}>
            <label className="input-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.authField}>
            <label className="input-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "8px" }}
            disabled={loading}
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className={styles.authFooter}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className={styles.authFooterLink}>
            Sign Up Free
          </Link>
        </p>
      </div>
    </div>
  );
}
