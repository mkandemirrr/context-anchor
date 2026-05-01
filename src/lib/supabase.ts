import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser-side usage (Client Components).
 * Uses cookies for session management via @supabase/ssr.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Database types for ContextAnchor tables.
 */
export interface Profile {
  id: string;
  email: string;
  display_name: string;
  subscription_tier: "free" | "pro";
  subscription_source: "lemon_squeezy" | "app_store" | null;
  subscription_expires_at: string | null;
  free_chats_remaining: number;
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  system_prompt: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  token_count: number | null;
  created_at: string;
}

export interface ContextSummary {
  id: string;
  session_id: string;
  summary_text: string;
  message_range_start: string | null;
  message_range_end: string | null;
  token_count: number | null;
  version: number;
  created_at: string;
}

export interface PromptTemplate {
  id: string;
  user_id: string;
  name: string;
  content: string;
  category: string | null;
  is_public: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}
