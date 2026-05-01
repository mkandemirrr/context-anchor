"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import styles from "./page.module.css";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  anchored?: boolean;
  anchorLabel?: string;
  hallucination?: {
    text: string;
    severity: "warning" | "danger";
  };
  provider?: string;
  model?: string;
}

interface ContextAnchor {
  id: string;
  text: string;
  type: "fact" | "decision" | "warning";
  messageId: string;
}

// Available AI providers and their models
const AI_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "🟢",
    models: [
      { id: "gpt-5.5", name: "GPT-5.5", tag: "Latest" },
      { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", tag: "Reasoning" },
      { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", tag: "Fast" },
      { id: "gpt-4o", name: "GPT-4o", tag: "Legacy" },
    ],
  },
  {
    id: "claude",
    name: "Claude",
    icon: "🟠",
    models: [
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", tag: "Latest" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", tag: "Fast" },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    icon: "🔵",
    models: [
      { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", tag: "Latest" },
      { id: "gemini-3.1-flash", name: "Gemini 3.1 Flash", tag: "Fast" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tag: "Stable" },
    ],
  },
];

function formatTime(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const supabase = createSupabaseBrowser();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const [anchors, setAnchors] = useState<ContextAnchor[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const maxTokens = 10000;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Provider/Model selection
  const [selectedProvider, setSelectedProvider] = useState("claude");
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-6");
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Anti-hallucination features
  const [enableGrounding, setEnableGrounding] = useState(false);
  const [enableVerification, setEnableVerification] = useState(false);
  const [lastGroundingSources, setLastGroundingSources] = useState<{title: string; url: string; snippet: string}[]>([]);
  const [lastVerification, setLastVerification] = useState<{verified: boolean; conflicts: string[]} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Demo hallucination detection
  const [previousDecisions, setPreviousDecisions] = useState<string[]>([]);

  const currentProvider = AI_PROVIDERS.find((p) => p.id === selectedProvider);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Load existing messages and anchors from DB on mount
  useEffect(() => {
    async function loadSession() {
      // Load messages
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (msgs && msgs.length > 0) {
        setMessages(
          msgs
            .filter((m: Record<string, unknown>) => (m.role as string) !== "system")
            .map((m: Record<string, unknown>) => ({
              id: m.id as string,
              role: m.role as "user" | "assistant",
              content: m.content as string,
              timestamp: formatTime(m.created_at as string),
            }))
        );
        const tokens = msgs.reduce(
          (sum: number, m: Record<string, unknown>) => sum + ((m.token_count as number) || 0),
          0
        );
        setTotalTokens(tokens);
      }

      // Load anchors
      const { data: dbAnchors } = await supabase
        .from("context_anchors")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (dbAnchors && dbAnchors.length > 0) {
        setAnchors(
          dbAnchors.map((a: Record<string, unknown>) => ({
            id: a.id as string,
            text: a.anchor_text as string,
            type: (a.anchor_type as string) as "fact" | "decision" | "warning",
            messageId: (a.source_message_id as string) || "",
          }))
        );
      }
    }

    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = AI_PROVIDERS.find((p) => p.id === providerId);
    if (provider && provider.models.length > 0) {
      setSelectedModel(provider.models[0].id);
    }
    setShowModelPicker(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const currentModelInfo = currentProvider?.models.find(
      (m) => m.id === selectedModel
    );

    const userContent = input.trim();

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: userContent,
      timestamp: formatTime(),
      provider: selectedProvider,
      model: selectedModel,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Save user message to DB
    const inputTokens = Math.ceil(userContent.split(" ").length * 1.3);
    setTotalTokens((prev) => prev + inputTokens);

    await supabase.from("messages").insert({
      session_id: sessionId,
      role: "user",
      content: userContent,
      token_count: inputTokens,
    });

    // Build message history for API
    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userContent },
    ];

    try {
      // Get user's own API keys if they set them in settings
      let userApiKeys = {};
      try {
        const savedKeys = localStorage.getItem("context_anchor_api_keys");
        if (savedKeys) userApiKeys = JSON.parse(savedKeys);
      } catch (e) {
        // ignore
      }

      // Call real AI API with anti-hallucination features
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          provider: selectedProvider,
          model: selectedModel,
          anchors: anchors,
          userApiKeys: userApiKeys,
          enableGrounding,
          enableVerification,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI request failed");
      }

      const aiContent = data.content || data.error || "No response";
      const responseTokens = Math.ceil(aiContent.split(" ").length * 1.3);
      setTotalTokens((prev) => prev + responseTokens);

      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: aiContent,
        timestamp: formatTime(),
        provider: selectedProvider,
        model: currentModelInfo?.name || data.model || selectedModel,
        hallucination: data.contradictions && data.contradictions.length > 0
          ? { text: data.contradictions[0].warning, severity: "warning" }
          : undefined,
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Store grounding sources and verification result
      if (data.groundingSources) setLastGroundingSources(data.groundingSources);
      if (data.verification) setLastVerification(data.verification);
      else setLastVerification(null);

      // Save AI message to DB
      const { data: dbAiMsg } = await supabase.from("messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: aiContent,
        token_count: responseTokens,
      }).select().single();

      // Handle new anchors
      if (data.newAnchors && data.newAnchors.length > 0) {
        const addedAnchors: ContextAnchor[] = [];
        
        for (const anchorData of data.newAnchors) {
          // Save to DB
          const { data: dbAnchor } = await supabase.from("context_anchors").insert({
            session_id: sessionId,
            source_message_id: dbAiMsg?.id || aiMsg.id,
            anchor_text: anchorData.text,
            anchor_type: anchorData.type,
          }).select().single();

          if (dbAnchor) {
            addedAnchors.push({
              id: dbAnchor.id,
              text: dbAnchor.anchor_text,
              type: dbAnchor.anchor_type as any,
              messageId: dbAnchor.source_message_id || "",
            });
          }
        }
        
        if (addedAnchors.length > 0) {
          setAnchors(prev => [...prev, ...addedAnchors]);
        }
      }

      // Update session title if first message
      if (messages.length === 0) {
        const title = userContent.slice(0, 60) + (userContent.length > 60 ? "..." : "");
        await supabase
          .from("chat_sessions")
          .update({ title })
          .eq("id", sessionId);
      }
    } catch (err) {
      const errorMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: `⚠️ Error: ${err instanceof Error ? err.message : "Failed to get AI response"}. Make sure you have an API key configured for the selected provider.`,
        timestamp: formatTime(),
        provider: selectedProvider,
        model: currentModelInfo?.name || selectedModel,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleHintClick = (hint: string) => {
    setInput(hint);
    inputRef.current?.focus();
  };

  const tokenPercentage = Math.min((totalTokens / maxTokens) * 100, 100);
  const tokenStatus =
    tokenPercentage > 80
      ? "danger"
      : tokenPercentage > 50
        ? "warning"
        : "safe";

  // Rolling summary (simulated)
  const rollingSummary =
    messages.length > 2
      ? `This conversation covers ${anchors.length} key decisions. Topics discussed include ${anchors.map((a) => a.text.split(":")[0]).join(", ") || "general discussion"}. Total messages: ${messages.length}.`
      : "No summary yet — start chatting to build context.";

  return (
    <div className={styles.chatPage}>
      {/* Top Bar */}
      <div className={styles.chatTopBar}>
        <div className={styles.chatTopBarLeft}>
          <Link href="/dashboard" className={styles.backBtn}>
            ←
          </Link>
          <div>
            <div className={styles.chatTitle}>Chat Session</div>
            <div className={styles.chatMeta}>
              {messages.length} messages · {anchors.length} anchors
            </div>
          </div>
        </div>

        <div className={styles.chatTopBarRight}>
          {/* Model Picker */}
          <div style={{ position: "relative" }}>
            <button
              className={styles.modelPickerBtn}
              onClick={() => setShowModelPicker(!showModelPicker)}
            >
              <span>{currentProvider?.icon}</span>
              <span className={styles.modelPickerName}>
                {currentProvider?.models.find((m) => m.id === selectedModel)
                  ?.name || selectedModel}
              </span>
              <span className={styles.modelPickerArrow}>▾</span>
            </button>

            {showModelPicker && (
              <div className={styles.modelPickerDropdown}>
                {AI_PROVIDERS.map((provider) => (
                  <div key={provider.id} className={styles.modelPickerGroup}>
                    <div className={styles.modelPickerGroupLabel}>
                      {provider.icon} {provider.name}
                    </div>
                    {provider.models.map((model) => (
                      <button
                        key={model.id}
                        className={`${styles.modelPickerOption} ${
                          selectedProvider === provider.id &&
                          selectedModel === model.id
                            ? styles.modelPickerOptionActive
                            : ""
                        }`}
                        onClick={() => {
                          handleProviderChange(provider.id);
                          setSelectedModel(model.id);
                          setShowModelPicker(false);
                        }}
                      >
                        <span>{model.name}</span>
                        {"tag" in model && model.tag && (
                          <span className={styles.modelPickerTag}>
                            {model.tag}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className={styles.topBarIconBtn} title="Export">
            📥
          </button>
          <button
            className={`${styles.contextToggle} ${showContext ? styles.contextToggleActive : ""}`}
            onClick={() => setShowContext(!showContext)}
          >
            🧠 Context
          </button>
        </div>
      </div>

      {/* Chat Body */}
      <div className={styles.chatBody}>
        {/* Messages Area */}
        <div className={styles.messagesArea}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>⚓</div>
              <h2 className={styles.emptyTitle}>
                Start a Grounded Conversation
              </h2>
              <p className={styles.emptyDesc}>
                ContextAnchor will automatically track key decisions, detect
                contradictions, and keep your AI grounded. Works with{" "}
                <strong>OpenAI</strong>, <strong>Claude</strong>, and{" "}
                <strong>Gemini</strong>. Try one of these:
              </p>
              <div className={styles.emptyHints}>
                <button
                  className={styles.emptyHint}
                  onClick={() =>
                    handleHintClick("Help me plan a React web application")
                  }
                >
                  💻 Plan a Web App
                </button>
                <button
                  className={styles.emptyHint}
                  onClick={() =>
                    handleHintClick(
                      "Design a database schema for an e-commerce app"
                    )
                  }
                >
                  🗄️ Database Design
                </button>
                <button
                  className={styles.emptyHint}
                  onClick={() =>
                    handleHintClick(
                      "Help me write a Flutter mobile app for task management"
                    )
                  }
                >
                  📱 Mobile App
                </button>
                <button
                  className={styles.emptyHint}
                  onClick={() =>
                    handleHintClick(
                      "Create a UI/UX design system for dark theme"
                    )
                  }
                >
                  🎨 Design System
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.messagesScroll} ref={scrollRef}>
              {messages.map((msg) => (
                <div key={msg.id} className={styles.messageGroup}>
                  <div
                    className={`${styles.messageAvatar} ${msg.role === "user" ? styles.messageAvatarUser : styles.messageAvatarAI}`}
                  >
                    {msg.role === "user" ? "U" : "⚓"}
                  </div>
                  <div className={styles.messageContent}>
                    <div className={styles.messageSender}>
                      {msg.role === "user" ? "You" : "ContextAnchor AI"}
                      {msg.role === "assistant" && msg.model && (
                        <span className={styles.messageModel}>
                          via {msg.model}
                        </span>
                      )}
                      <span className={styles.messageSenderTime}>
                        {msg.timestamp}
                      </span>
                    </div>
                    <div className={styles.messageText}>
                      {msg.content.split("\n").map((line, i) => {
                        // Parse confidence markers
                        let confidenceLevel: "high" | "medium" | "low" | "uncertain" | null = null;
                        let cleanLine = line;

                        if (line.includes("[LOW_CONFIDENCE]")) {
                          confidenceLevel = "low";
                          cleanLine = line.replace(/\[LOW_CONFIDENCE\]\s*/g, "");
                        } else if (line.includes("[MEDIUM_CONFIDENCE]")) {
                          confidenceLevel = "medium";
                          cleanLine = line.replace(/\[MEDIUM_CONFIDENCE\]\s*/g, "");
                        } else if (line.includes("[UNCERTAIN]")) {
                          confidenceLevel = "uncertain";
                          cleanLine = line.replace(/\[UNCERTAIN\]\s*/g, "");
                        }

                        const htmlContent = cleanLine
                          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                          .replace(/`(.*?)`/g, "<code>$1</code>")
                          .replace(/^• /, "→ ")
                          // Render source references
                          .replace(/\[Source (\d+)\]/g, '<span class="source-ref">[Source $1]</span>');

                        if (confidenceLevel === "uncertain") {
                          return (
                            <div key={i} className={styles.uncertainBlock}>
                              <span className={styles.uncertainIcon}>⚠️</span>
                              <p dangerouslySetInnerHTML={{ __html: htmlContent }} />
                            </div>
                          );
                        }

                        return (
                          <div key={i} className={styles.confidenceLine}>
                            {confidenceLevel && (
                              <span
                                className={`${styles.confidenceBadge} ${
                                  confidenceLevel === "medium" ? styles.confidenceMedium : styles.confidenceLow
                                }`}
                                title={confidenceLevel === "medium" ? "Moderate confidence — verify if critical" : "Low confidence — may be inaccurate"}
                              >
                                {confidenceLevel === "medium" ? "🟡" : "🔴"}
                              </span>
                            )}
                            <p dangerouslySetInnerHTML={{ __html: htmlContent }} />
                          </div>
                        );
                      })}
                    </div>

                    {/* Anchor indicator */}
                    {msg.anchored && (
                      <div className={styles.anchorPin}>
                        ⚓ Anchored: {msg.anchorLabel}
                      </div>
                    )}

                    {/* Hallucination warning */}
                    {msg.hallucination && (
                      <div className={styles.hallucinationWarning}>
                        <span className={styles.hallucinationWarningIcon}>
                          ⚠️
                        </span>
                        <div className={styles.hallucinationWarningText}>
                          <strong>Contradiction Detected: </strong>
                          {msg.hallucination.text}
                        </div>
                      </div>
                    )}

                    {/* Grounding Sources */}
                    {msg.role === "assistant" && lastGroundingSources.length > 0 && messages[messages.length - 1].id === msg.id && (
                      <div className={styles.groundingSourcesContainer}>
                        <div className={styles.groundingSourcesTitle}>🌍 Grounding Sources Used</div>
                        <ul className={styles.groundingSourcesList}>
                          {lastGroundingSources.map((s, idx) => (
                            <li key={idx}>
                              <a href={s.url} target="_blank" rel="noopener noreferrer">
                                [Source {idx + 1}] {s.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Verification Result */}
                    {msg.role === "assistant" && lastVerification && messages[messages.length - 1].id === msg.id && (
                      <div className={`${styles.verificationBox} ${lastVerification.verified ? styles.verificationPass : styles.verificationFail}`}>
                        <div className={styles.verificationTitle}>
                          {lastVerification.verified ? "✅ Verified by Secondary Model" : "⚠️ Verification Issues Detected"}
                        </div>
                        {!lastVerification.verified && lastVerification.conflicts && (
                          <ul className={styles.verificationConflicts}>
                            {lastVerification.conflicts.map((c, idx) => (
                              <li key={idx}>{c}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className={styles.messageGroup}>
                  <div
                    className={`${styles.messageAvatar} ${styles.messageAvatarAI}`}
                  >
                    ⚓
                  </div>
                  <div className={styles.messageContent}>
                    <div className={styles.messageSender}>
                      ContextAnchor AI
                      <span className={styles.messageModel}>
                        via{" "}
                        {currentProvider?.models.find(
                          (m) => m.id === selectedModel
                        )?.name || selectedModel}
                      </span>
                    </div>
                    <div className={styles.typingIndicator}>
                      <div className={styles.typingDot} />
                      <div className={styles.typingDot} />
                      <div className={styles.typingDot} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input Area */}
          <div className={styles.inputArea}>
            <div className={styles.inputContainer}>
              <div className={styles.inputWrapper}>
                <textarea
                  ref={inputRef}
                  className={styles.chatInput}
                  placeholder="Type your message... (Shift+Enter for new line)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className={styles.sendBtn}
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                >
                  ↑
                </button>
              </div>

              {/* Anti-Hallucination Controls */}
              <div className={styles.antiHallucinationControls}>
                <label className={styles.controlLabel}>
                  <input 
                    type="checkbox" 
                    checked={enableGrounding} 
                    onChange={(e) => setEnableGrounding(e.target.checked)} 
                  />
                  🌍 Web Grounding
                </label>
                <label className={styles.controlLabel}>
                  <input 
                    type="checkbox" 
                    checked={enableVerification} 
                    onChange={(e) => setEnableVerification(e.target.checked)} 
                  />
                  ⚖️ Dual-Model Verify (Pro)
                </label>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: "none" }} 
                  accept=".txt,.md,.json,.csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    setUploadingFile(true);
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("sessionId", sessionId);
                    
                    try {
                      // Get auth token from supabase session
                      const { data: { session } } = await supabase.auth.getSession();
                      
                      const res = await fetch("/api/upload", {
                        method: "POST",
                        headers: session?.access_token ? {
                          Authorization: `Bearer ${session.access_token}`
                        } : {},
                        body: formData
                      });
                      
                      const data = await res.json();
                      if (data.success) {
                        alert(`Uploaded! ${data.storedChunks} chunks indexed for RAG.`);
                      } else {
                        alert(`Upload failed: ${data.error}`);
                      }
                    } catch (err) {
                      console.error("Upload error:", err);
                      alert("Failed to upload document.");
                    } finally {
                      setUploadingFile(false);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }
                  }}
                />
                <button 
                  className={styles.uploadBtn} 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                >
                  {uploadingFile ? "⏳ Uploading..." : "📄 Upload Doc"}
                </button>
              </div>
            </div>
            <div className={styles.inputMeta}>
              <div className={styles.tokenCounter}>
                <span
                  className={`${styles.tokenDot} ${tokenStatus === "warning" ? styles.tokenDotWarning : tokenStatus === "danger" ? styles.tokenDotDanger : ""}`}
                />
                {totalTokens.toLocaleString()} / {maxTokens.toLocaleString()}{" "}
                tokens
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-muted)",
                }}
              >
                {anchors.length} anchors active
              </span>
            </div>
          </div>
        </div>

        {/* Context Panel */}
        {showContext && (
          <div className={styles.contextPanel}>
            <div className={styles.contextPanelHeader}>
              <div className={styles.contextPanelTitle}>🧠 Context Panel</div>
              <button
                className={styles.contextPanelClose}
                onClick={() => setShowContext(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.contextPanelBody}>
              {/* Active Model */}
              <div className={styles.contextSection}>
                <div className={styles.contextSectionTitle}>
                  🤖 Active Model
                </div>
                <div className={styles.contextModelInfo}>
                  <span className={styles.contextModelIcon}>
                    {currentProvider?.icon}
                  </span>
                  <div>
                    <div className={styles.contextModelName}>
                      {currentProvider?.models.find(
                        (m) => m.id === selectedModel
                      )?.name || selectedModel}
                    </div>
                    <div className={styles.contextModelProvider}>
                      {currentProvider?.name}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rolling Summary */}
              <div className={styles.contextSection}>
                <div className={styles.contextSectionTitle}>
                  📋 Rolling Summary
                </div>
                <div className={styles.contextSummary}>
                  <div className={styles.contextSummaryLabel}>
                    Auto-generated · v
                    {Math.max(1, Math.floor(messages.length / 3))}
                  </div>
                  {rollingSummary}
                </div>
              </div>

              {/* Anchored Facts */}
              <div className={styles.contextSection}>
                <div className={styles.contextSectionTitle}>
                  ⚓ Anchored Decisions ({anchors.length})
                </div>
                {anchors.length === 0 ? (
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "var(--color-text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    No anchors yet. Key decisions will appear here
                    automatically.
                  </div>
                ) : (
                  anchors.map((anchor) => (
                    <div key={anchor.id} className={styles.contextAnchorItem}>
                      <span className={styles.contextAnchorIcon}>✓</span>
                      {anchor.text}
                    </div>
                  ))
                )}
              </div>

              {/* Warnings */}
              {messages.some((m) => m.hallucination) && (
                <div className={styles.contextSection}>
                  <div className={styles.contextSectionTitle}>⚠️ Warnings</div>
                  {messages
                    .filter((m) => m.hallucination)
                    .map((m) => (
                      <div key={m.id} className={styles.contextWarningItem}>
                        ⚠️ {m.hallucination!.text}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Token Usage */}
            <div className={styles.tokenUsagePanel}>
              <div className={styles.tokenUsageLabel}>
                <span>Context Window</span>
                <span>
                  {totalTokens.toLocaleString()} /{" "}
                  {maxTokens.toLocaleString()}
                </span>
              </div>
              <div className={styles.tokenUsageTrack}>
                <div
                  className={`${styles.tokenUsageFill} ${
                    tokenStatus === "safe"
                      ? styles.tokenFillSafe
                      : tokenStatus === "warning"
                        ? styles.tokenFillWarning
                        : styles.tokenFillDanger
                  }`}
                  style={{ width: `${tokenPercentage}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
