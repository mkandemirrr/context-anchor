"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import styles from "./page.module.css";

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const handleGetStarted = async (e: React.MouseEvent, plan?: string) => {
    e.preventDefault();
    setIsStarting(true);
    const supabase = createSupabaseBrowser();
    
    // Check if user is already logged in
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      router.push("/dashboard");
      return;
    }

    // Sign in anonymously
    const { error } = await supabase.auth.signInAnonymously();
    if (!error) {
      router.push("/dashboard");
    } else {
      console.error("Anonymous sign in failed:", error);
      setIsStarting(false);
      // Fallback to standard signup
      router.push(plan ? `/signup?plan=${plan}` : "/signup");
    }
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className={styles.landing}>
      {/* Navigation */}
      <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ""}`}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoIcon}>⚓</span>
            <span className="text-gradient">ContextAnchor</span>
          </Link>

          <div className={styles.navLinks}>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#how-it-works" className={styles.navLink}>How It Works</a>
            <a href="#pricing" className={styles.navLink}>Pricing</a>
          </div>

          <div className={styles.navActions}>
            <Link href="/login" className="btn btn-ghost">Log In</Link>
            <button onClick={handleGetStarted} disabled={isStarting} className="btn btn-primary">
              {isStarting ? "Starting..." : "Get Started Free"}
            </button>
          </div>

          <button className={styles.mobileMenuBtn} aria-label="Menu">☰</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} />
            AI-Powered Context Management
          </div>

          <h1 className={styles.heroTitle}>
            Stop AI{" "}
            <span className="text-gradient">Hallucinations</span>
            <br />
            Before They Start
          </h1>

          <p className={styles.heroSubtitle}>
            ContextAnchor automatically tracks, summarizes, and anchors your AI
            conversations across ChatGPT, Claude, and Gemini — so your chatbot never
            loses context or makes things up.
          </p>

          <div className={styles.heroCTA}>
            <button onClick={handleGetStarted} disabled={isStarting} className="btn btn-primary btn-lg">
              ✦ {isStarting ? "Creating Session..." : "Start Free — 3 Chats"}
            </button>
            <a href="#how-it-works" className="btn btn-secondary btn-lg">
              See How It Works
            </a>
          </div>

          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <div className={styles.heroStatValue}>⚓</div>
              <div className={styles.heroStatLabel}>Context Anchoring</div>
            </div>
            <div className={styles.heroStat}>
              <div className={styles.heroStatValue}>∞</div>
              <div className={styles.heroStatLabel}>Context Length</div>
            </div>
            <div className={styles.heroStat}>
              <div className={styles.heroStatValue}>3</div>
              <div className={styles.heroStatLabel}>Free Chats</div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Demo Preview */}
      <section className={styles.demoSection}>
        <div className={styles.demoContainer}>
          <div className={styles.demoWindow}>
            <div className={styles.demoTitleBar}>
              <span className={`${styles.demoDot} ${styles.demoDotRed}`} />
              <span className={`${styles.demoDot} ${styles.demoDotYellow}`} />
              <span className={`${styles.demoDot} ${styles.demoDotGreen}`} />
              <span className={styles.demoTitle}>
                ContextAnchor — Chat Session: &quot;Product Strategy Q2&quot;
              </span>
            </div>
            <div className={styles.demoBody}>
              <div className={styles.demoChat}>
                <div className={styles.demoMessage}>
                  <div className={`${styles.demoAvatar} ${styles.demoAvatarUser}`}>U</div>
                  <div className={styles.demoBubble}>
                    We decided on React Native for the mobile app. Can you help me plan the API endpoints?
                  </div>
                </div>
                <div className={styles.demoMessage}>
                  <div className={`${styles.demoAvatar} ${styles.demoAvatarAI}`}>⚓</div>
                  <div className={styles.demoBubble}>
                    Based on our earlier discussion about the <strong>React Native</strong> choice and your <strong>PostgreSQL + Supabase</strong> backend, here are the recommended REST endpoints...
                  </div>
                </div>
                <div className={styles.demoMessage}>
                  <div className={`${styles.demoAvatar} ${styles.demoAvatarUser}`}>U</div>
                  <div className={styles.demoBubble}>
                    Wait, didn&apos;t we choose Flutter earlier?
                  </div>
                </div>
                <div className={styles.demoMessage}>
                  <div className={`${styles.demoAvatar} ${styles.demoAvatarAI}`}>⚓</div>
                  <div className={styles.demoBubble}>
                    ⚠️ <strong>Context Check:</strong> In message #3, you explicitly chose React Native over Flutter. I&apos;ve anchored this decision. Would you like to change it?
                  </div>
                </div>
              </div>

              <div className={styles.demoContextPanel}>
                <div className={styles.demoContextTitle}>
                  🧠 Context Anchors
                </div>
                <div className={styles.demoContextItem}>
                  ✓ Tech Stack: React Native + Supabase + PostgreSQL
                </div>
                <div className={styles.demoContextItem}>
                  ✓ Target: iOS & Android launch Q2 2026
                </div>
                <div className={`${styles.demoContextItem} ${styles.demoContextItemWarning}`}>
                  ⚠️ Contradiction detected: Flutter vs React Native (msg #3 vs #12)
                </div>

                <div className={styles.demoTokenBar}>
                  <div className={styles.demoTokenLabel}>
                    Token Usage: 4,200 / 10,000
                  </div>
                  <div className={styles.demoTokenTrack}>
                    <div className={styles.demoTokenFill} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.features} id="features">
        <div className={styles.featuresInner}>
          <div className={styles.sectionTag}>⚡ Core Features</div>
          <h2 className={styles.sectionTitle}>
            Everything You Need to{" "}
            <span className="text-gradient">Ground Your AI</span>
          </h2>
          <p className={styles.sectionSubtitle}>
            Six powerful tools that work together to keep your AI conversations
            accurate, consistent, and hallucination-free.
          </p>

          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={`${styles.featureIcon} ${styles.featureIconPurple}`}>🔄</div>
              <h3 className={styles.featureTitle}>Rolling Summaries</h3>
              <p className={styles.featureDesc}>
                Automatically compresses and summarizes conversation history every N messages,
                preserving critical context while staying within token limits.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={`${styles.featureIcon} ${styles.featureIconCyan}`}>⚓</div>
              <h3 className={styles.featureTitle}>Context Anchoring</h3>
              <p className={styles.featureDesc}>
                Pins important decisions, facts, and agreements as immutable anchors
                that persist throughout the entire conversation.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={`${styles.featureIcon} ${styles.featureIconYellow}`}>⚠️</div>
              <h3 className={styles.featureTitle}>Hallucination Detection</h3>
              <p className={styles.featureDesc}>
                Real-time contradiction detection compares new responses against
                anchored facts and flags inconsistencies instantly.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={`${styles.featureIcon} ${styles.featureIconGreen}`}>✏️</div>
              <h3 className={styles.featureTitle}>Prompt Editor</h3>
              <p className={styles.featureDesc}>
                Visual prompt editor with syntax highlighting, version history,
                and template library for crafting perfect system prompts.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={`${styles.featureIcon} ${styles.featureIconBlue}`}>📊</div>
              <h3 className={styles.featureTitle}>Token Monitor</h3>
              <p className={styles.featureDesc}>
                Real-time token usage tracking with smart alerts before you hit
                context window limits. Never lose context mid-conversation.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={`${styles.featureIcon} ${styles.featureIconRed}`}>🤖</div>
              <h3 className={styles.featureTitle}>Multi-Model Support</h3>
              <p className={styles.featureDesc}>
                Switch between GPT-5.5, Claude Opus 4.7, and Gemini 3.1 Pro
                seamlessly. One interface, every major AI model.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={styles.howItWorks} id="how-it-works">
        <div className={styles.howItWorksInner}>
          <div className={styles.sectionTag}>🛠️ How It Works</div>
          <h2 className={styles.sectionTitle}>
            Four Steps to{" "}
            <span className="text-gradient">Grounded AI</span>
          </h2>
          <p className={styles.sectionSubtitle}>
            ContextAnchor works silently in the background, keeping your AI honest.
          </p>

          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Pick Your Model</h3>
              <p className={styles.stepDesc}>
                Choose from GPT-5.5, Claude Opus 4.7, or Gemini 3.1. Add an optional system prompt to set context.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Chat Naturally</h3>
              <p className={styles.stepDesc}>
                Talk as usual. ContextAnchor records and summarizes in real-time behind the scenes.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Auto-Anchor</h3>
              <p className={styles.stepDesc}>
                Key decisions and facts are automatically pinned as context anchors.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <h3 className={styles.stepTitle}>Stay Grounded</h3>
              <p className={styles.stepDesc}>
                If the AI contradicts itself, you get instant warnings with source references.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className={styles.pricing} id="pricing">
        <div className={styles.pricingInner}>
          <div className={styles.sectionTag}>💎 Pricing</div>
          <h2 className={styles.sectionTitle}>
            Start Free,{" "}
            <span className="text-gradient">Go Pro</span>
          </h2>
          <p className={styles.sectionSubtitle} style={{ margin: "0 auto" }}>
            Try ContextAnchor with 3 free chat sessions. No credit card required.
          </p>

          <div className={styles.pricingGrid}>
            {/* Free Plan */}
            <div className={styles.pricingCard}>
              <div className={styles.pricingTier}>Free</div>
              <div className={styles.pricingPrice}>
                $0
                <span className={styles.pricingPriceSuffix}> forever</span>
              </div>
              <p className={styles.pricingDesc}>Perfect for trying ContextAnchor</p>
              <ul className={styles.pricingFeatures}>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureIncluded}`}>✓</span>
                  3 chat sessions total
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureIncluded}`}>✓</span>
                  Rolling summaries
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureIncluded}`}>✓</span>
                  Basic hallucination alerts
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureDisabled}`}>✗</span>
                  Prompt template library
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureDisabled}`}>✗</span>
                  Cross-platform sync
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureDisabled}`}>✗</span>
                  Priority support
                </li>
              </ul>
              <button onClick={handleGetStarted} disabled={isStarting} className="btn btn-secondary" style={{ width: "100%" }}>
                {isStarting ? "Starting..." : "Start Free"}
              </button>
            </div>

            {/* Pro Plan */}
            <div className={`${styles.pricingCard} ${styles.pricingCardPro}`}>
              <div className={styles.pricingBadge}>MOST POPULAR</div>
              <div className={styles.pricingTier}>Pro</div>
              <div className={styles.pricingPrice}>
                $9.99
                <span className={styles.pricingPriceSuffix}> / month</span>
              </div>
              <p className={styles.pricingDesc}>Unlimited AI sessions, all features</p>
              <ul className={styles.pricingFeatures}>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureIncluded}`}>✓</span>
                  <strong>Unlimited</strong> chat sessions
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureIncluded}`}>✓</span>
                  Advanced context anchoring
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureIncluded}`}>✓</span>
                  Real-time hallucination detection
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureIncluded}`}>✓</span>
                  Full prompt template library
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureIncluded}`}>✓</span>
                  All models: GPT-5.5, Claude, Gemini
                </li>
                <li className={styles.pricingFeature}>
                  <span className={`${styles.pricingFeatureIcon} ${styles.pricingFeatureIncluded}`}>✓</span>
                  Priority support
                </li>
              </ul>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <button onClick={(e) => handleGetStarted(e, "pro")} disabled={isStarting} className="btn btn-primary" style={{ width: "100%" }}>
                  {isStarting ? "Starting..." : "✦ Go Pro ($9.99/mo)"}
                </button>
                <button onClick={(e) => handleGetStarted(e, "yearly")} disabled={isStarting} className="btn btn-secondary" style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {isStarting ? "Starting..." : "⚡ Go Pro Yearly ($99/yr) — Save 17%"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaGlow} />
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>
            Ready to <span className="text-gradient">Anchor</span> Your AI?
          </h2>
          <p className={styles.ctaDesc}>
            Join thousands of professionals who trust ContextAnchor to keep their
            AI conversations grounded and hallucination-free.
          </p>
          <button onClick={handleGetStarted} disabled={isStarting} className="btn btn-primary btn-lg">
            ✦ {isStarting ? "Starting..." : "Get Started Free"}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerCopy}>
            © 2026 ContextAnchor. All rights reserved.
          </div>
          <div className={styles.footerLinks}>
            <a href="#" className={styles.footerLink}>Privacy</a>
            <a href="#" className={styles.footerLink}>Terms</a>
            <a href="#" className={styles.footerLink}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
