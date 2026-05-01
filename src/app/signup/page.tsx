"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import styles from "../login/page.module.css";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const supabase = createSupabaseBrowser();
    
    // Check if user is currently anonymous
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user?.is_anonymous) {
      // Upgrade anonymous account
      const { error: updateError } = await supabase.auth.updateUser({
        email,
        password,
        data: { full_name: name }
      });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      setSuccess("Account saved successfully! You can now access your chats from anywhere.");
    } else {
      // Normal sign up
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      setSuccess(
        "Account created! Check your email to confirm your address, then log in."
      );
    }
    
    setLoading(false);
  };

  const handleAppleSignup = async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleGoogleSignup = async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
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

        <h1 className={styles.authTitle}>Create Account</h1>
        <p className={styles.authSubtitle}>
          Start with 3 free AI chat sessions
        </p>

        <div className={styles.authFreeBadge}>
          🎁 3 Free Chat Sessions — No Credit Card Required
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button className={styles.authSocialBtn} onClick={handleGoogleSignup}>
            <span className={styles.authSocialIcon}>G</span>
            Sign up with Google
          </button>

          <button className={styles.authSocialBtn} onClick={handleAppleSignup}>
            <span className={styles.authSocialIcon}></span>
            Sign up with Apple
          </button>
        </div>

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

        {success && (
          <div className={styles.authSuccess}>
            ✅ {success}
          </div>
        )}

        <form className={styles.authForm} onSubmit={handleSignup}>
          <div className={styles.authField}>
            <label className="input-label" htmlFor="signup-name">Full Name</label>
            <input
              id="signup-name"
              className="input"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.authField}>
            <label className="input-label" htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.authField}>
            <label className="input-label" htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              className="input"
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "8px" }}
            disabled={loading || !!success}
          >
            {loading ? "Creating account..." : "✦ Create Free Account"}
          </button>
        </form>

        <p className={styles.authFooter}>
          Already have an account?{" "}
          <Link href="/login" className={styles.authFooterLink}>
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}
