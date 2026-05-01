/**
 * ContextAnchor — Context Engine
 *
 * The heart of the hallucination prevention system.
 * Handles rolling summaries, context injection, and anchor management.
 */

export interface Anchor {
  id: string;
  text: string;
  type: "fact" | "decision" | "constraint";
  sourceMessageId: string;
  createdAt: number;
}

export interface RollingSummary {
  version: number;
  text: string;
  messageRangeStart: number;
  messageRangeEnd: number;
  tokenCount: number;
}

export interface ContextPayload {
  systemPrompt: string;
  contextSummary: string;
  anchors: string[];
  recentMessages: { role: string; content: string }[];
  totalTokens: number;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  tokenCount?: number;
}

/**
 * Estimates token count for a string (rough approximation).
 * For production, use tiktoken or the OpenAI tokenizer.
 */
export function estimateTokens(text: string): number {
  // ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * Extracts key facts/decisions from AI responses.
 * Uses pattern matching to identify anchoring opportunities.
 */
export function extractAnchors(
  content: string,
  messageId: string
): Anchor[] {
  const anchors: Anchor[] = [];
  const patterns = [
    // Technology decisions
    /(?:(?:we'll|let's|I recommend|choosing|decided on|going with)\s+)(\*\*[\w\s.+]+\*\*[\w\s]*(?:with|and|for)[\w\s.+*]*)/gi,
    // Explicit decisions with "recommend" or "suggest"
    /(?:I (?:recommend|suggest))\s+(.+?)(?:\.|$)/gi,
    // Key facts with "will use" or "chosen"
    /(?:(?:will use|have chosen|selected))\s+(.+?)(?:\.|$)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const text = match[1]
        .replace(/\*\*/g, "")
        .trim()
        .substring(0, 100);
      if (text.length > 5) {
        anchors.push({
          id: `anchor-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          text,
          type: "decision",
          sourceMessageId: messageId,
          createdAt: Date.now(),
        });
      }
    }
  }

  return anchors;
}

/**
 * Creates a rolling summary from conversation messages.
 * This summary replaces older messages in the context window.
 */
export function createRollingSummary(
  messages: ChatMessage[],
  previousSummary?: RollingSummary
): RollingSummary {
  // Summarize by extracting key points from messages
  const keyPoints: string[] = [];
  const topics = new Set<string>();

  for (const msg of messages) {
    // Extract topics from user messages
    if (msg.role === "user") {
      const words = msg.content.toLowerCase().split(/\s+/);
      const techTerms = words.filter(
        (w) =>
          [
            "react",
            "flutter",
            "swift",
            "python",
            "database",
            "api",
            "auth",
            "design",
            "deploy",
            "test",
            "mobile",
            "web",
            "backend",
            "frontend",
            "supabase",
            "firebase",
            "postgresql",
          ].includes(w)
      );
      techTerms.forEach((t) => topics.add(t));
    }

    // Extract key statements from AI messages
    if (msg.role === "assistant") {
      const sentences = msg.content.split(/[.!]\s/);
      for (const sentence of sentences) {
        if (
          sentence.includes("recommend") ||
          sentence.includes("suggest") ||
          sentence.includes("decided") ||
          sentence.includes("choose") ||
          sentence.includes("important")
        ) {
          keyPoints.push(sentence.trim().substring(0, 150));
        }
      }
    }
  }

  const summaryParts: string[] = [];

  if (previousSummary) {
    summaryParts.push(`Previous context: ${previousSummary.text}`);
  }

  if (topics.size > 0) {
    summaryParts.push(`Topics discussed: ${Array.from(topics).join(", ")}`);
  }

  if (keyPoints.length > 0) {
    summaryParts.push(`Key points: ${keyPoints.slice(-5).join(". ")}`);
  }

  summaryParts.push(`Total messages in session: ${messages.length}`);

  const summaryText = summaryParts.join("\n");

  return {
    version: (previousSummary?.version ?? 0) + 1,
    text: summaryText,
    messageRangeStart: 0,
    messageRangeEnd: messages.length - 1,
    tokenCount: estimateTokens(summaryText),
  };
}

/**
 * Detects contradictions between new content and existing anchors.
 * Returns contradicting pairs if found.
 */
export function detectContradictions(
  newContent: string,
  existingAnchors: Anchor[]
): { anchor: Anchor; contradiction: string }[] {
  const contradictions: { anchor: Anchor; contradiction: string }[] = [];
  const lower = newContent.toLowerCase();

  // Technology contradiction patterns
  const techPairs: [string[], string[]][] = [
    [["react", "next.js", "nextjs"], ["flutter", "dart"]],
    [["react", "next.js", "nextjs"], ["vue", "nuxt"]],
    [["react", "next.js", "nextjs"], ["angular"]],
    [["flutter", "dart"], ["react native", "expo"]],
    [["postgresql", "postgres"], ["mongodb", "mongo"]],
    [["supabase"], ["firebase"]],
    [["rest", "restful"], ["graphql"]],
    [["typescript"], ["javascript only", "vanilla js"]],
  ];

  for (const anchor of existingAnchors) {
    const anchorLower = anchor.text.toLowerCase();

    for (const [groupA, groupB] of techPairs) {
      const anchorInA = groupA.some((t) => anchorLower.includes(t));
      const anchorInB = groupB.some((t) => anchorLower.includes(t));
      const newInA = groupA.some((t) => lower.includes(t));
      const newInB = groupB.some((t) => lower.includes(t));

      if ((anchorInA && newInB) || (anchorInB && newInA)) {
        const conflictTech = newInB
          ? groupB.find((t) => lower.includes(t))
          : groupA.find((t) => lower.includes(t));
        contradictions.push({
          anchor,
          contradiction: `Previously anchored "${anchor.text}" but now mentioning "${conflictTech}". This may cause context confusion.`,
        });
      }
    }
  }

  return contradictions;
}

/**
 * Builds the context payload to send to the AI.
 * Optimizes for the given token budget.
 */
export function buildContextPayload(
  systemPrompt: string,
  summary: RollingSummary | null,
  anchors: Anchor[],
  recentMessages: ChatMessage[],
  maxTokens: number = 8000
): ContextPayload {
  const anchorTexts = anchors.map((a) => `[ANCHOR] ${a.text}`);
  const summaryText = summary?.text ?? "";

  // Build the enhanced system prompt
  const contextBlock = [
    "=== CONTEXT ANCHORS (Do NOT contradict these) ===",
    ...anchorTexts,
    "",
    "=== ROLLING SUMMARY ===",
    summaryText,
    "",
    "=== INSTRUCTIONS ===",
    "You are a helpful AI assistant. CRITICAL: Never contradict the anchored facts above.",
    "If the user asks about something that conflicts with an anchor, politely point out the existing decision.",
    "Always be consistent with previous context.",
  ].join("\n");

  const enhancedSystemPrompt = systemPrompt
    ? `${systemPrompt}\n\n${contextBlock}`
    : contextBlock;

  // Calculate token budget for recent messages
  const systemTokens = estimateTokens(enhancedSystemPrompt);
  const remainingTokens = maxTokens - systemTokens;

  // Include as many recent messages as the budget allows
  const includedMessages: { role: string; content: string }[] = [];
  let usedTokens = 0;

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(recentMessages[i].content);
    if (usedTokens + msgTokens > remainingTokens) break;
    includedMessages.unshift({
      role: recentMessages[i].role,
      content: recentMessages[i].content,
    });
    usedTokens += msgTokens;
  }

  return {
    systemPrompt: enhancedSystemPrompt,
    contextSummary: summaryText,
    anchors: anchorTexts,
    recentMessages: includedMessages,
    totalTokens: systemTokens + usedTokens,
  };
}
