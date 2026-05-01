"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import type { Profile } from "@/lib/supabase";
import styles from "./page.module.css";

interface ChatSession {
  id: string;
  title: string;
  preview: string;
  anchors: number;
  tokens: number;
  status: "active" | "archived";
  updatedAt: string;
}

const PROMPT_TEMPLATES = [
  {
    icon: "💻",
    name: "Code Review Expert",
    desc: "Systematic code review with security focus",
  },
  {
    icon: "✍️",
    name: "Content Writer",
    desc: "SEO-optimized long-form content creation",
  },
  {
    icon: "🔬",
    name: "Research Assistant",
    desc: "Academic research with citation tracking",
  },
  {
    icon: "📊",
    name: "Data Analyst",
    desc: "Data interpretation and visualization guidance",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeTab, setActiveTab] = useState<"chats" | "prompts" | "settings">("chats");
  const [loading, setLoading] = useState(true);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState<"monthly" | "yearly" | "topup" | false>(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState({
    openai: "",
    claude: "",
    gemini: "",
  });
  const [keysSaved, setKeysSaved] = useState(false);

  useEffect(() => {
    // Load keys from localStorage
    const savedKeys = localStorage.getItem("context_anchor_api_keys");
    if (savedKeys) {
      try {
        setApiKeys(JSON.parse(savedKeys));
      } catch (e) {
        console.error("Failed to parse saved API keys");
      }
    }
  }, []);

  const handleSaveKeys = () => {
    localStorage.setItem("context_anchor_api_keys", JSON.stringify(apiKeys));
    setKeysSaved(true);
    setTimeout(() => setKeysSaved(false), 2000);
  };

  useEffect(() => {
    async function loadProfile() {
      const supabase = createSupabaseBrowser();
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setIsAnonymous(user.is_anonymous || false);

      // Get profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData as Profile);
      }

      // Get chat sessions
      const { data: sessionsData } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (sessionsData) {
        setSessions(
          sessionsData.map((s: Record<string, unknown>) => ({
            id: s.id as string,
            title: s.title as string,
            preview: (s.system_prompt as string) || "Chat session...",
            anchors: 0,
            tokens: 0,
            status: s.status as "active" | "archived",
            updatedAt: new Date(s.updated_at as string).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
          }))
        );
      }

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  const handleNewChat = async () => {
    if (profile && profile.subscription_tier === "free" && profile.free_chats_remaining <= 0) {
      alert("You have reached your free chat limit.");
      if (isAnonymous) {
        router.push("/signup");
      }
      return;
    }

    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Create a new chat session in the database
    const { data: newSession, error } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        title: "New Chat Session",
      })
      .select()
      .single();

    if (error || !newSession) {
      console.error("Failed to create session:", error);
      return;
    }

    // Decrement free chats if on free tier
    if (profile && profile.subscription_tier === "free") {
      await supabase
        .from("profiles")
        .update({ free_chats_remaining: profile.free_chats_remaining - 1 })
        .eq("id", user.id);

      setProfile({
        ...profile,
        free_chats_remaining: profile.free_chats_remaining - 1,
      });
    }

    router.push(`/chat/${newSession.id}`);
  };

  const handleLogout = async () => {
    try {
      const supabase = createSupabaseBrowser();
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpgrade = async (plan: "monthly" | "yearly" | "topup" = "monthly") => {
    if (isAnonymous) {
      // Must save account before purchasing
      router.push(plan === "monthly" || plan === "yearly" ? "/signup?plan=pro" : "/signup");
      return;
    }

    try {
      setIsUpgrading(plan);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile?.id,
          email: profile?.email,
          plan: plan
        }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error(data.error || "Failed to create checkout");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to start checkout. Please try again.");
      setIsUpgrading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "var(--color-text-muted)",
          fontSize: "1rem",
        }}>
          Loading...
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className={styles.dashboard}>
      {/* Top Navigation Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Link href="/" className={styles.topBarLogo}>
            <span className={styles.topBarLogoIcon}>⚓</span>
            <span className="text-gradient">ContextAnchor</span>
          </Link>
          <div className={styles.topBarNav}>
            <button
              className={`${styles.topBarNavItem} ${activeTab === "chats" ? styles.topBarNavItemActive : ""}`}
              onClick={() => setActiveTab("chats")}
            >
              💬 Chats
            </button>
            <button
              className={`${styles.topBarNavItem} ${activeTab === "prompts" ? styles.topBarNavItemActive : ""}`}
              onClick={() => setActiveTab("prompts")}
            >
              ✏️ Prompts
            </button>
            <button
              className={`${styles.topBarNavItem} ${activeTab === "settings" ? styles.topBarNavItemActive : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              ⚙️ Settings
            </button>
          </div>
        </div>

        <div className={styles.topBarRight}>
          <span
            className={`${styles.tierBadge} ${profile.subscription_tier === "pro" ? styles.tierBadgePro : styles.tierBadgeFree}`}
          >
            {profile.subscription_tier === "pro" ? "✦ PRO" : "FREE"}
          </span>
          <div className={styles.userMenuWrapper}>
            <div
              className={styles.userAvatar}
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              title="Account"
            >
              {profile.display_name?.charAt(0).toUpperCase() || "U"}
            </div>
            {showProfileMenu && (
              <div className={styles.profileDropdown}>
                <div className={styles.profileDropdownHeader}>
                  <div className={styles.profileDropdownName}>{profile.display_name}</div>
                  <div className={styles.profileDropdownEmail}>{profile.email}</div>
                </div>
                <div className={styles.profileDropdownDivider} />
                <div className={styles.profileDropdownItem}>
                  <span>Plan</span>
                  <span className={`${styles.tierBadge} ${profile.subscription_tier === "pro" ? styles.tierBadgePro : styles.tierBadgeFree}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                    {profile.subscription_tier === "pro" ? "✦ PRO" : "FREE"}
                  </span>
                </div>
                {profile.subscription_tier === "free" && (
                  <div className={styles.profileDropdownItem}>
                    <span>Free Chats</span>
                    <span>{profile.free_chats_remaining} remaining</span>
                  </div>
                )}
                {profile.subscription_expires_at && (
                  <div className={styles.profileDropdownItem}>
                    <span>Renews</span>
                    <span>{new Date(profile.subscription_expires_at).toLocaleDateString()}</span>
                  </div>
                )}
                <div className={styles.profileDropdownDivider} />
                <button className={styles.profileDropdownLogout} onClick={handleLogout}>
                  🚪 Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Welcome Banner */}
        <div className={styles.welcomeBanner}>
          <div className={styles.welcomeText}>
            <h2>
              Welcome back, <span className="text-gradient">{profile.display_name}</span> 👋
            </h2>
            <p>Your AI conversations are anchored and hallucination-free.</p>
          </div>
          <div className={styles.welcomeStats}>
            <div className={styles.welcomeStat}>
              <div className={styles.welcomeStatValue}>{sessions.length}</div>
              <div className={styles.welcomeStatLabel}>Sessions</div>
            </div>
            <div className={styles.welcomeStat}>
              <div className={styles.welcomeStatValue}>
                {sessions.reduce((a, s) => a + s.anchors, 0)}
              </div>
              <div className={styles.welcomeStatLabel}>Anchors</div>
            </div>
            {profile.subscription_tier === "free" && (
              <div className={styles.welcomeStat}>
                <div className={styles.welcomeStatValue}>
                  {profile.free_chats_remaining}
                </div>
                <div className={styles.welcomeStatLabel}>Free Left</div>
              </div>
            )}
          </div>
        </div>

        {/* Chats Tab */}
        {activeTab === "chats" && (
          <>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Chat Sessions</h3>
            </div>

            <div className={styles.sessionsGrid}>
              {/* New Session Card */}
              <div className={styles.newSessionCard} onClick={handleNewChat}>
                <div className={styles.newSessionIcon}>+</div>
                <div className={styles.newSessionLabel}>New Chat Session</div>
                {profile.subscription_tier === "free" && (
                  <div className={styles.newSessionLimit}>
                    {profile.free_chats_remaining} free session{profile.free_chats_remaining !== 1 ? "s" : ""} remaining
                  </div>
                )}
              </div>

              {/* Existing Sessions */}
              {sessions.map((session) => (
                <Link
                  href={`/chat/${session.id}`}
                  key={session.id}
                  className={styles.sessionCard}
                >
                  <div className={styles.sessionCardHeader}>
                    <div>
                      <div className={styles.sessionTitle}>{session.title}</div>
                      <div className={styles.sessionMeta}>{session.updatedAt}</div>
                    </div>
                    <span
                      className={`${styles.sessionStatus} ${styles.sessionStatusActive}`}
                    >
                      Active
                    </span>
                  </div>
                  <div className={styles.sessionPreview}>{session.preview}</div>
                  <div className={styles.sessionFooter}>
                    <div className={styles.sessionAnchors}>
                      ⚓ {session.anchors} anchors
                    </div>
                    <div className={styles.sessionTokens}>
                      {session.tokens.toLocaleString()} tokens
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Upgrade Banner for Free Users */}
            {profile.subscription_tier === "free" && (
              <div className={styles.upgradeBanner}>
                <div className={styles.upgradeBannerText}>
                  <h3>
                    🚀 Unlock <span className="text-gradient">Unlimited</span>{" "}
                    Sessions
                  </h3>
                  <p>
                    Upgrade to Pro for unlimited chats, advanced anchoring, and
                    cross-platform sync.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "16px", flexWrap: "wrap" }}>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => handleUpgrade("monthly")}
                    disabled={isUpgrading !== false}
                  >
                    {isUpgrading === "monthly" ? "Loading..." : "✦ Pro ($9.99/mo)"}
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => handleUpgrade("yearly")}
                    disabled={isUpgrading !== false}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    {isUpgrading === "yearly" ? "Loading..." : "⚡ Pro Yearly ($99/yr)"}
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => handleUpgrade("topup")}
                    disabled={isUpgrading !== false}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    {isUpgrading === "topup" ? "Loading..." : "🎁 100 Chats ($4.99)"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Prompts Tab */}
        {activeTab === "prompts" && (
          <div className={styles.templatesSection}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Prompt Templates</h3>
              <button className="btn btn-secondary btn-sm">+ Create Template</button>
            </div>
            <div className={styles.templatesGrid}>
              {PROMPT_TEMPLATES.map((tpl, i) => (
                <div key={i} className={styles.templateCard}>
                  <div className={styles.templateIcon}>{tpl.icon}</div>
                  <div className={styles.templateName}>{tpl.name}</div>
                  <div className={styles.templateDesc}>{tpl.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div style={{ maxWidth: 600 }}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Account Settings</h3>
            </div>

            {isAnonymous && (
              <div className="card" style={{ marginBottom: "var(--space-lg)", border: "1px solid var(--color-primary)" }}>
                <h4 style={{ marginBottom: "8px", color: "var(--color-primary)" }}>⚠️ Unsaved Account</h4>
                <p style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
                  You are currently using a temporary guest account. To save your chats, increase your limits, and use ContextAnchor across devices, please create a free account.
                </p>
                <Link href="/signup" className="btn btn-primary" style={{ display: "inline-block" }}>
                  Save Account (Free)
                </Link>
              </div>
            )}

            <div className="card" style={{ marginBottom: "var(--space-lg)" }}>
              <div style={{ marginBottom: "var(--space-md)" }}>
                <label className="input-label">Display Name</label>
                <input className="input" value={profile.display_name || ""} readOnly />
              </div>
              <div style={{ marginBottom: "var(--space-md)" }}>
                <label className="input-label">Email</label>
                <input className="input" value={profile.email || ""} readOnly />
              </div>
              <div>
                <label className="input-label">Subscription</label>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
                  <span
                    className={`${styles.tierBadge} ${profile.subscription_tier === "pro" ? styles.tierBadgePro : styles.tierBadgeFree}`}
                  >
                    {profile.subscription_tier === "pro" ? "✦ PRO" : "FREE"}
                  </span>
                  {profile.subscription_tier === "free" && (
                    <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                      {profile.free_chats_remaining} free chats remaining
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <label className="input-label">API Keys</label>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "16px" }}>
                Add your own API keys to use your preferred AI providers.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                <div>
                  <label className="input-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    🟢 OpenAI
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "var(--color-primary)", marginLeft: "auto", textDecoration: "none" }}>Get Key ↗</a>
                  </label>
                  <input 
                    className="input" 
                    type="password" 
                    placeholder="sk-..." 
                    value={apiKeys.openai}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="input-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    🟠 Anthropic (Claude)
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "var(--color-primary)", marginLeft: "auto", textDecoration: "none" }}>Get Key ↗</a>
                  </label>
                  <input 
                    className="input" 
                    type="password" 
                    placeholder="sk-ant-..." 
                    value={apiKeys.claude}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, claude: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="input-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    🔵 Google (Gemini)
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "var(--color-primary)", marginLeft: "auto", textDecoration: "none" }}>Get Key ↗</a>
                  </label>
                  <input 
                    className="input" 
                    type="password" 
                    placeholder="AIza..." 
                    value={apiKeys.gemini}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
                <button className="btn btn-secondary btn-sm" onClick={handleSaveKeys}>
                  Save Keys
                </button>
                {keysSaved && <span style={{ color: "var(--color-success)", fontSize: "0.85rem" }}>Saved!</span>}
              </div>
            </div>

            <button
              className="btn btn-danger"
              style={{ marginTop: "var(--space-xl)" }}
              onClick={handleLogout}
            >
              {isAnonymous ? "Delete Guest Account" : "Log Out"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
