import { NextRequest, NextResponse } from "next/server";
import {
  buildContextPayload,
  detectContradictions,
  createRollingSummary,
  estimateTokens,
  extractAnchors,
  type Anchor,
  type RollingSummary,
} from "@/lib/context-engine";
import { getGroundingContext, type SearchResult } from "@/lib/search-engine";

/**
 * Supported AI providers and their configurations.
 */
const PROVIDER_CONFIG: Record<
  string,
  {
    url: string;
    defaultModel: string;
    models: string[];
    envKey: string;
    formatRequest: (
      messages: { role: string; content: string }[],
      model: string,
      apiKey: string
    ) => { url: string; headers: Record<string, string>; body: string };
    parseResponse: (data: Record<string, unknown>) => { content: string; model: string };
  }
> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-5.5",
    models: ["gpt-5.5", "gpt-5.4-pro", "gpt-5.4-mini", "gpt-4o"],
    envKey: "OPENAI_API_KEY",
    formatRequest: (messages, model, apiKey) => ({
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    }),
    parseResponse: (data) => ({
      content:
        ((data.choices as Array<{ message: { content: string } }>)?.[0]
          ?.message?.content as string) ?? "",
      model: (data.model as string) ?? "openai",
    }),
  },
  claude: {
    url: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-sonnet-4-6",
    models: [
      "claude-sonnet-4-6",
      "claude-3-5-haiku-20241022",
    ],
    envKey: "ANTHROPIC_API_KEY",
    formatRequest: (messages, model, apiKey) => {
      // Claude uses a different format: separate system from messages
      const systemMsg = messages.find((m) => m.role === "system");
      const chatMessages = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          system: systemMsg?.content ?? "",
          messages: chatMessages,
        }),
      };
    },
    parseResponse: (data) => ({
      content:
        ((data.content as Array<{ type: string; text: string }>)?.[0]
          ?.text as string) ?? "",
      model: (data.model as string) ?? "claude",
    }),
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    defaultModel: "gemini-3.1-pro",
    models: ["gemini-3.1-pro", "gemini-3.1-flash", "gemini-2.5-pro"],
    envKey: "GOOGLE_AI_API_KEY",
    formatRequest: (messages, model, apiKey) => {
      // Gemini uses a different format
      const systemMsg = messages.find((m) => m.role === "system");
      const chatMessages = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: systemMsg
            ? { parts: [{ text: systemMsg.content }] }
            : undefined,
          contents: chatMessages,
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7,
          },
        }),
      };
    },
    parseResponse: (data) => ({
      content:
        ((
          data.candidates as Array<{
            content: { parts: Array<{ text: string }> };
          }>
        )?.[0]?.content?.parts?.[0]?.text as string) ?? "",
      model: "gemini",
    }),
  },
};

/**
 * POST /api/chat
 *
 * Multi-provider AI Chat Proxy with Context Anchoring.
 * Supports OpenAI, Claude, and Gemini.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      messages,
      systemPrompt = "",
      anchors = [] as Anchor[],
      summary = null as RollingSummary | null,
      provider = "openai",
      model,
      userApiKeys = {} as Record<string, string>,
      enableGrounding = false,
      enableVerification = false,
    } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Validate provider
    const providerConfig = PROVIDER_CONFIG[provider];
    if (!providerConfig) {
      return NextResponse.json(
        {
          error: `Unsupported provider: ${provider}. Supported: ${Object.keys(PROVIDER_CONFIG).join(", ")}`,
          code: "INVALID_PROVIDER",
        },
        { status: 400 }
      );
    }

    // Determine which API key to use (user's key > platform key)
    const apiKey =
      userApiKeys[provider] || process.env[providerConfig.envKey];
    if (!apiKey) {
      return NextResponse.json(
        {
          error: `No API key configured for ${provider}. Please add your API key in Settings.`,
          code: "NO_API_KEY",
        },
        { status: 401 }
      );
    }

    // Use specified model or provider default
    const selectedModel = model || providerConfig.defaultModel;

    // Check for contradictions in the latest user message
    const lastUserMessage = [...messages]
      .reverse()
      .find((m: { role: string }) => m.role === "user");
    const contradictions = lastUserMessage
      ? detectContradictions(lastUserMessage.content, anchors)
      : [];

    // === KATMAN 3: Web Search Grounding ===
    let groundingSources: SearchResult[] = [];
    let groundingPromptAddition = "";
    if (enableGrounding && lastUserMessage) {
      const grounding = await getGroundingContext(lastUserMessage.content);
      if (grounding) {
        groundingSources = grounding.sources;
        groundingPromptAddition = grounding.groundingPrompt;
      }
    }

    // Build optimized context payload
    const contextPayload = buildContextPayload(
      systemPrompt,
      summary,
      anchors,
      messages,
      8000
    );

    // Build provider-specific request (with grounding if available)
    const finalSystemPrompt = groundingPromptAddition
      ? `${contextPayload.systemPrompt}\n${groundingPromptAddition}`
      : contextPayload.systemPrompt;

    const apiMessages = [
      { role: "system", content: finalSystemPrompt },
      ...contextPayload.recentMessages,
    ];

    const requestConfig = providerConfig.formatRequest(
      apiMessages,
      selectedModel,
      apiKey
    );

    // Call AI API
    const aiResponse = await fetch(requestConfig.url, {
      method: "POST",
      headers: requestConfig.headers,
      body: requestConfig.body,
    });

    if (!aiResponse.ok) {
      const errorData = await aiResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: `${provider} API error`,
          details: errorData,
          code: "AI_ERROR",
        },
        { status: aiResponse.status }
      );
    }

    const aiData = await aiResponse.json();
    const parsed = providerConfig.parseResponse(aiData);

    // Generate updated rolling summary (every 5 messages)
    let updatedSummary = summary;
    if (messages.length % 5 === 0) {
      updatedSummary = createRollingSummary(messages, summary ?? undefined);
    }

    // Extract new anchors from AI response
    // Generating a pseudo message ID since the real ID will be created on the client/DB
    const tempMsgId = `ai-msg-${Date.now()}`;
    const newAnchors = extractAnchors(parsed.content, tempMsgId);

    // Calculate token usage
    const responseTokens = estimateTokens(parsed.content);
    const totalTokens = contextPayload.totalTokens + responseTokens;

    // === KATMAN 4: Dual-Model Verification (Pro-only) ===
    let verificationResult: { verified: boolean; conflicts: string[] } | null = null;
    if (enableVerification && parsed.content) {
      try {
        // Use a different provider for verification
        const verifyProvider = provider === "claude" ? "gemini" : "claude";
        const verifyConfig = PROVIDER_CONFIG[verifyProvider];
        const verifyKey = userApiKeys[verifyProvider] || process.env[verifyConfig?.envKey || ""];

        if (verifyConfig && verifyKey) {
          const verifyMessages = [
            {
              role: "system",
              content: `You are a fact-checker. Review the following AI response for accuracy. Reply ONLY with a JSON object: {"verified": true/false, "conflicts": ["list of inaccurate claims if any"]}. Be strict but fair.`,
            },
            {
              role: "user",
              content: `Original question: ${lastUserMessage?.content || ""}

AI Response to verify:
${parsed.content}`,
            },
          ];

          const verifyReq = verifyConfig.formatRequest(
            verifyMessages,
            verifyConfig.defaultModel,
            verifyKey
          );

          const verifyRes = await fetch(verifyReq.url, {
            method: "POST",
            headers: verifyReq.headers,
            body: verifyReq.body,
          });

          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            const verifyParsed = verifyConfig.parseResponse(verifyData);
            try {
              // Try to parse JSON from verification response
              const jsonMatch = verifyParsed.content.match(/\{[^}]+\}/);
              if (jsonMatch) {
                verificationResult = JSON.parse(jsonMatch[0]);
              }
            } catch {
              // Verification parsing failed, skip
            }
          }
        }
      } catch (err) {
        console.error("Verification failed:", err);
      }
    }

    return NextResponse.json({
      content: parsed.content,
      message: parsed.content,
      contradictions:
        contradictions.length > 0
          ? contradictions.map((c) => ({
              anchorText: c.anchor.text,
              warning: c.contradiction,
            }))
          : [],
      newAnchors: newAnchors.map((a) => ({ text: a.text, type: a.type })),
      summary: updatedSummary,
      tokenUsage: {
        prompt: contextPayload.totalTokens,
        completion: responseTokens,
        total: totalTokens,
      },
      provider,
      model: parsed.model,
      // Katman 3: Grounding sources
      groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
      // Katman 4: Verification result
      verification: verificationResult || undefined,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat
 *
 * Returns available providers and models.
 */
export async function GET() {
  const providers = Object.entries(PROVIDER_CONFIG).map(([key, config]) => ({
    id: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    models: config.models,
    defaultModel: config.defaultModel,
    configured: !!process.env[config.envKey],
  }));

  return NextResponse.json({ providers });
}
