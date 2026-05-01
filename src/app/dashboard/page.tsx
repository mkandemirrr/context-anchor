"use client";

import { useState, useEffect, useRef } from "react";
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

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

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      console.error("Logout failed:", err);
    }
  };

  const handleUpgrade = async (plan: "monthly" | "yearly" | "topup") => {
    setIsUpgrading(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Failed to start checkout. Please try again.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Something went wrong. Please try again.");
    }
    setIsUpgrading(false);
  };

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
        <p>Loading your workspace...</p>
      </div>
    );
  }

  if (!profile) return null;

  const displayName = profile.display_name || profile.email?.split("@")[0] || "User";

  return (
    <div className={styles.dashboard}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${mobileSidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarHeader}>
          <Link href="/" className={styles.sidebarLogo}>
            <span className={styles.sidebarLogoIcon}>⚓</span>
            <span className="text-gradient">ContextAnchor</span>
          </Link>
        </div>

        <nav className={styles.sidebarNav}>
          <div className={styles.sidebarNavLabel}>WORKSPACE</div>
          <button
            className={`${styles.sidebarNavItem} ${activeTab === "chats" ? styles.sidebarNavItemActive : ""}`}
            onClick={() => { setActiveTab("chats"); setMobileSidebarOpen(false); }}
          >
            <span className={styles.sidebarNavIcon}>💬</span>
            Chats
            <span className={styles.sidebarNavBadge}>{sessions.length}</span>
          </button>
          <button
            className={`${styles.sidebarNavItem} ${activeTab === "prompts" ? styles.sidebarNavItemActive : ""}`}
            onClick={() => { setActiveTab("prompts"); setMobileSidebarOpen(false); }}
          >
            <span className={styles.sidebarNavIcon}>✏️</span>
            Prompt Templates
          </button>

          <div className={styles.sidebarNavLabel} style={{ marginTop: "24px" }}>ACCOUNT</div>
          <button
            className={`${styles.sidebarNavItem} ${activeTab === "settings" ? styles.sidebarNavItemActive : ""}`}
            onClick={() => { setActiveTab("settings"); setMobileSidebarOpen(false); }}
          >
            <span className={styles.sidebarNavIcon}>⚙️</span>
            Settings
          </button>
        </nav>

        {/* Sidebar Upgrade CTA */}
        {profile.subscription_tier === "free" && (
          <div className={styles.sidebarUpgrade}>
            <div className={styles.sidebarUpgradeText}>
              <strong>Upgrade to Pro</strong>
              <span>Unlock unlimited chats</span>
            </div>
            <button className={styles.sidebarUpgradeBtn} onClick={() => handleUpgrade("monthly")}>
              {isUpgrading === "monthly" ? "..." : "Upgrade"}
            </button>
          </div>
        )}

        {/* Sidebar User */}
        <div className={styles.sidebarUser} ref={profileMenuRef}>
          <div className={styles.sidebarUserInfo} onClick={() => setShowProfileMenu(!showProfileMenu)}>
            <div className={styles.userAvatar}>
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className={styles.sidebarUserDetails}>
              <div className={styles.sidebarUserName}>{displayName}</div>
              <div className={styles.sidebarUserPlan}>
                {profile.subscription_tier === "pro" ? "✦ Pro Plan" : "Free Plan"}
              </div>
            </div>
            <span className={styles.sidebarUserChevron}>⋯</span>
          </div>

          {showProfileMenu && (
            <div className={styles.profileDropdown}>
              <div className={styles.profileDropdownHeader}>
                <div className={styles.profileDropdownName}>{displayName}</div>
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
      </aside>

      {/* Mobile Overlay */}
      {mobileSidebarOpen && <div className={styles.mobileOverlay} onClick={() => setMobileSidebarOpen(false)} />}

      {/* Main Content Area */}
      <main className={styles.mainContent}>
        {/* Top Bar (Mobile + Breadcrumb) */}
        <div className={styles.contentHeader}>
          <button className={styles.mobileMenuBtn} onClick={() => setMobileSidebarOpen(true)}>
            ☰
          </button>
          <h1 className={styles.contentTitle}>
            {activeTab === "chats" && "Chat Sessions"}
            {activeTab === "prompts" && "Prompt Templates"}
            {activeTab === "settings" && "Account Settings"}
          </h1>
          <div className={styles.contentHeaderRight}>
            <span
              className={`${styles.tierBadge} ${profile.subscription_tier === "pro" ? styles.tierBadgePro : styles.tierBadgeFree}`}
            >
              {profile.subscription_tier === "pro" ? "✦ PRO" : "FREE"}
            </span>
          </div>
        </div>

        {/* Page Content */}
        <div className={styles.contentBody}>

          {/* ===== CHATS TAB ===== */}
          {activeTab === "chats" && (
            <>
              {/* Stats Row */}
              <div className={styles.statsRow}>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>💬</div>
                  <div className={styles.statInfo}>
                    <div className={styles.statValue}>{sessions.length}</div>
                    <div className={styles.statLabel}>Total Sessions</div>
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>⚓</div>
                  <div className={styles.statInfo}>
                    <div className={styles.statValue}>{sessions.reduce((a, s) => a + s.anchors, 0)}</div>
                    <div className={styles.statLabel}>Anchors Used</div>
                  </div>
                </div>
                {profile.subscription_tier === "free" && (
                  <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
                    <div className={styles.statIcon}>🎁</div>
                    <div className={styles.statInfo}>
                      <div className={styles.statValue}>{profile.free_chats_remaining}</div>
                      <div className={styles.statLabel}>Free Chats Left</div>
                    </div>
                  </div>
                )}
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>🛡️</div>
                  <div className={styles.statInfo}>
                    <div className={styles.statValue}>94%</div>
                    <div className={styles.statLabel}>Less Hallucination</div>
                  </div>
                </div>
              </div>

              {/* New Chat + Sessions */}
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
                  <div className={styles.upgradeBannerLeft}>
                    <div className={styles.upgradeBannerIcon}>🚀</div>
                    <div className={styles.upgradeBannerText}>
                      <h3>Unlock <span className="text-gradient">Unlimited</span> Sessions</h3>
                      <p>Upgrade to Pro for unlimited chats, advanced anchoring, and cross-platform sync.</p>
                    </div>
                  </div>
                  <div className={styles.upgradeBannerActions}>
                    <button
                      className={styles.upgradeBtn}
                      onClick={() => handleUpgrade("monthly")}
                      disabled={isUpgrading !== false}
                    >
                      {isUpgrading === "monthly" ? "Loading..." : "✦ Pro — $9.99/mo"}
                    </button>
                    <button
                      className={styles.upgradeBtnSecondary}
                      onClick={() => handleUpgrade("yearly")}
                      disabled={isUpgrading !== false}
                    >
                      {isUpgrading === "yearly" ? "Loading..." : "⚡ Yearly — $99/yr"}
                    </button>
                    <button
                      className={styles.upgradeBtnSecondary}
                      onClick={() => handleUpgrade("topup")}
                      disabled={isUpgrading !== false}
                    >
                      {isUpgrading === "topup" ? "Loading..." : "🎁 100 Chats — $4.99"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== PROMPTS TAB ===== */}
          {activeTab === "prompts" && (
            <>
              <div className={styles.sectionHeader}>
                <p className={styles.sectionSubtitle}>Use pre-built templates to anchor your AI conversations.</p>
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
            </>
          )}

          {/* ===== SETTINGS TAB ===== */}
          {activeTab === "settings" && (
            <div className={styles.settingsContainer}>
              {isAnonymous && (
                <div className={styles.settingsAlert}>
                  <h4>⚠️ Unsaved Account</h4>
                  <p>You are currently using a temporary guest account. Create a free account to save your chats.</p>
                  <Link href="/signup" className={styles.upgradeBtn} style={{ display: "inline-block", marginTop: "12px" }}>
                    Save Account (Free)
                  </Link>
                </div>
              )}

              <div className={styles.settingsSection}>
                <h3 className={styles.settingsSectionTitle}>Profile</h3>
                <div className={styles.settingsCard}>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>Display Name</label>
                    <input className={styles.settingsInput} value={displayName} readOnly />
                  </div>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>Email</label>
                    <input className={styles.settingsInput} value={profile.email || ""} readOnly />
                  </div>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>Subscription</label>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
                      <span className={`${styles.tierBadge} ${profile.subscription_tier === "pro" ? styles.tierBadgePro : styles.tierBadgeFree}`}>
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
              </div>

              <div className={styles.settingsSection}>
                <h3 className={styles.settingsSectionTitle}>API Keys</h3>
                <p className={styles.settingsSectionDesc}>Add your own API keys to use your preferred AI providers.</p>
                <div className={styles.settingsCard}>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>
                      🟢 OpenAI
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className={styles.settingsLabelLink}>Get Key ↗</a>
                    </label>
                    <input
                      className={styles.settingsInput}
                      type="password"
                      placeholder="sk-..."
                      value={apiKeys.openai}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                    />
                  </div>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>
                      🟠 Anthropic (Claude)
                      <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className={styles.settingsLabelLink}>Get Key ↗</a>
                    </label>
                    <input
                      className={styles.settingsInput}
                      type="password"
                      placeholder="sk-ant-..."
                      value={apiKeys.claude}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, claude: e.target.value }))}
                    />
                  </div>
                  <div className={styles.settingsField}>
                    <label className={styles.settingsLabel}>
                      🔵 Google (Gemini)
                      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className={styles.settingsLabelLink}>Get Key ↗</a>
                    </label>
                    <input
                      className={styles.settingsInput}
                      type="password"
                      placeholder="AIza..."
                      value={apiKeys.gemini}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
                    <button className={styles.upgradeBtn} onClick={handleSaveKeys} style={{ padding: "8px 20px" }}>
                      Save Keys
                    </button>
                    {keysSaved && <span style={{ color: "var(--color-success)", fontSize: "0.85rem" }}>✓ Saved!</span>}
                  </div>
                </div>
              </div>

              <div className={styles.settingsSection}>
                <h3 className={styles.settingsSectionTitle}>Danger Zone</h3>
                <div className={styles.settingsCard} style={{ borderColor: "rgba(255,107,107,0.2)" }}>
                  <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "12px" }}>
                    {isAnonymous ? "Delete your guest account and all data." : "Sign out of your account."}
                  </p>
                  <button className={styles.dangerBtn} onClick={handleLogout}>
                    {isAnonymous ? "Delete Guest Account" : "Log Out"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
