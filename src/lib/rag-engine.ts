/**
 * ContextAnchor — RAG Engine (Document Grounding)
 *
 * Retrieval-Augmented Generation for grounding AI responses
 * in user-uploaded documents using Supabase pgvector.
 */

import { createClient } from "@supabase/supabase-js";

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    filename: string;
    chunkIndex: number;
    totalChunks: number;
  };
  similarity?: number;
}

/**
 * Splits a document into chunks for embedding.
 * Uses a sliding window approach to maintain context between chunks.
 */
export function chunkDocument(
  text: string,
  filename: string,
  chunkSize: number = 500,
  overlap: number = 50
): { content: string; metadata: { filename: string; chunkIndex: number; totalChunks: number } }[] {
  const words = text.split(/\s+/);
  const chunks: { content: string; metadata: { filename: string; chunkIndex: number; totalChunks: number } }[] = [];

  let start = 0;
  let chunkIndex = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunkContent = words.slice(start, end).join(" ");

    chunks.push({
      content: chunkContent,
      metadata: {
        filename,
        chunkIndex,
        totalChunks: 0, // Will be set after all chunks are created
      },
    });

    chunkIndex++;
    start = end - overlap; // Overlap for context continuity
    if (start >= words.length) break;
  }

  // Set totalChunks
  chunks.forEach((c) => (c.metadata.totalChunks = chunks.length));

  return chunks;
}

/**
 * Generates embeddings for text using OpenAI's embedding API.
 * Falls back to a simple TF-IDF-like approach if no API key is available.
 */
async function generateEmbedding(
  text: string,
  apiKey?: string
): Promise<number[]> {
  const openaiKey = apiKey || process.env.OPENAI_API_KEY;

  if (openaiKey) {
    try {
      const response = await fetch(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text.substring(0, 8000), // Limit input
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.data?.[0]?.embedding || [];
      }
    } catch (e) {
      console.error("OpenAI embedding failed:", e);
    }
  }

  // Fallback: Simple hash-based pseudo-embedding (384 dimensions)
  // This is NOT a real embedding, just a deterministic vector for basic matching
  const dims = 384;
  const embedding = new Array(dims).fill(0);
  const words = text.toLowerCase().split(/\s+/);

  for (const word of words) {
    for (let i = 0; i < word.length; i++) {
      const idx = (word.charCodeAt(i) * (i + 1)) % dims;
      embedding[idx] += 1 / words.length;
    }
  }

  // Normalize
  const magnitude = Math.sqrt(
    embedding.reduce((sum: number, v: number) => sum + v * v, 0)
  );
  if (magnitude > 0) {
    for (let i = 0; i < dims; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

/**
 * Stores document chunks with embeddings in Supabase.
 */
export async function storeDocumentChunks(
  sessionId: string,
  userId: string,
  chunks: { content: string; metadata: { filename: string; chunkIndex: number; totalChunks: number } }[],
  openaiApiKey?: string
): Promise<number> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let stored = 0;

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.content, openaiApiKey);

    const { error } = await supabase.from("document_chunks").insert({
      session_id: sessionId,
      user_id: userId,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding,
    });

    if (!error) stored++;
  }

  return stored;
}

/**
 * Retrieves the most relevant document chunks for a query.
 * Uses cosine similarity via pgvector.
 */
export async function retrieveRelevantChunks(
  sessionId: string,
  query: string,
  topK: number = 5,
  openaiApiKey?: string
): Promise<DocumentChunk[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const queryEmbedding = await generateEmbedding(query, openaiApiKey);

  // Use Supabase RPC for vector similarity search
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: queryEmbedding,
    match_session_id: sessionId,
    match_threshold: 0.5,
    match_count: topK,
  });

  if (error) {
    console.error("RAG retrieval error:", error);

    // Fallback: simple text search if pgvector not available
    const { data: fallbackData } = await supabase
      .from("document_chunks")
      .select("*")
      .eq("session_id", sessionId)
      .textSearch("content", query.split(/\s+/).slice(0, 5).join(" & "), {
        type: "websearch",
      })
      .limit(topK);

    if (fallbackData) {
      return fallbackData.map((d: Record<string, unknown>) => ({
        id: d.id as string,
        content: d.content as string,
        metadata: d.metadata as DocumentChunk["metadata"],
      }));
    }

    return [];
  }

  return (data || []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    content: d.content as string,
    metadata: d.metadata as DocumentChunk["metadata"],
    similarity: d.similarity as number,
  }));
}

/**
 * Formats retrieved chunks into a grounding context for the AI.
 */
export function formatRAGContext(chunks: DocumentChunk[]): string {
  if (chunks.length === 0) return "";

  return [
    "",
    "=== DOCUMENT CONTEXT (from uploaded files) ===",
    "The following excerpts are from the user's uploaded documents.",
    "CRITICAL: Base your answer primarily on these document excerpts when relevant.",
    "If the document doesn't contain the answer, say so clearly.",
    "",
    ...chunks.map(
      (c, i) =>
        `[Doc ${i + 1}] (${c.metadata.filename}, chunk ${c.metadata.chunkIndex + 1}/${c.metadata.totalChunks})\n${c.content}\n`
    ),
    "=== END DOCUMENT CONTEXT ===",
  ].join("\n");
}
