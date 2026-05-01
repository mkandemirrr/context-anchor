/**
 * ContextAnchor — Search Engine (Web Grounding)
 *
 * Searches the web to provide grounding sources for AI responses.
 * Supports Brave Search API (free tier: 2000 queries/month).
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface GroundingContext {
  query: string;
  sources: SearchResult[];
  groundingPrompt: string;
}

/**
 * Extracts search-worthy keywords from a user message.
 * Filters out common words and focuses on factual queries.
 */
function extractSearchQuery(message: string): string | null {
  // Don't search for very short messages or greetings
  const lower = message.toLowerCase().trim();
  const skipPatterns = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|bye)/,
    /^(how are you|what's up|can you help)/,
  ];

  if (lower.length < 15 || skipPatterns.some((p) => p.test(lower))) {
    return null;
  }

  // Detect factual/verifiable questions
  const factualIndicators = [
    "what is",
    "what are",
    "who is",
    "who was",
    "when did",
    "when was",
    "where is",
    "how many",
    "how much",
    "is it true",
    "does",
    "did",
    "explain",
    "tell me about",
    "define",
    "latest",
    "current",
    "recent",
    "statistics",
    "data",
    "price",
    "cost",
    "population",
    "capital",
    "founded",
    "released",
    "version",
  ];

  const isFactual = factualIndicators.some((ind) => lower.includes(ind));

  if (!isFactual) {
    return null; // Don't search for opinions, code help, etc.
  }

  // Clean the message to form a search query
  const query = message
    .replace(/[?!.,;:]/g, "")
    .replace(/\b(please|can you|could you|tell me|explain|what is|what are)\b/gi, "")
    .trim()
    .substring(0, 150);

  return query || null;
}

/**
 * Searches the web using Brave Search API.
 * Falls back gracefully if no API key or if the search fails.
 */
async function searchBrave(
  query: string,
  apiKey: string,
  count: number = 5
): Promise<SearchResult[]> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) {
      console.error(`Brave Search error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    interface BraveWebResult {
      title: string;
      url: string;
      description: string;
    }

    const results: SearchResult[] = (
      data.web?.results || []
    ).map((r: BraveWebResult) => ({
      title: r.title,
      url: r.url,
      snippet: r.description?.substring(0, 300) || "",
    }));

    return results;
  } catch (error) {
    console.error("Brave Search failed:", error);
    return [];
  }
}

/**
 * Main grounding function.
 * Takes a user message, searches the web, and returns formatted grounding context.
 */
export async function getGroundingContext(
  userMessage: string,
  apiKey?: string
): Promise<GroundingContext | null> {
  // Extract a searchable query
  const query = extractSearchQuery(userMessage);
  if (!query) return null;

  // Determine which search API to use
  const braveKey = apiKey || process.env.BRAVE_SEARCH_API_KEY;

  if (!braveKey) {
    console.log("No search API key configured, skipping grounding");
    return null;
  }

  const sources = await searchBrave(query, braveKey);

  if (sources.length === 0) return null;

  // Format grounding context for the AI
  const groundingPrompt = [
    "",
    "=== WEB GROUNDING SOURCES ===",
    "The following sources were retrieved from the web. Use them to ground your response in factual information.",
    "When referencing these sources, use [Source N] notation.",
    "",
    ...sources.map(
      (s, i) =>
        `[Source ${i + 1}] ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet}\n`
    ),
    "=== END GROUNDING SOURCES ===",
    "",
    "IMPORTANT: Base your answer on the grounding sources above when relevant.",
    "If the sources don't contain the answer, say so and provide your best knowledge with appropriate confidence markers.",
  ].join("\n");

  return {
    query,
    sources,
    groundingPrompt,
  };
}
