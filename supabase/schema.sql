-- ============================================
-- ContextAnchor — Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- 1. User Profiles
-- ===========================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    subscription_tier TEXT NOT NULL DEFAULT 'free'
        CHECK (subscription_tier IN ('free', 'pro')),
    subscription_source TEXT
        CHECK (subscription_source IN ('lemon_squeezy', 'app_store', NULL)),
    subscription_expires_at TIMESTAMPTZ,
    free_chats_remaining INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===========================================
-- 2. Chat Sessions
-- ===========================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Chat Session',
    system_prompt TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_status ON chat_sessions(status);

-- ===========================================
-- 3. Messages
-- ===========================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    token_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ===========================================
-- 4. Context Summaries (Rolling Summaries)
-- ===========================================
CREATE TABLE IF NOT EXISTS context_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    message_range_start UUID REFERENCES messages(id),
    message_range_end UUID REFERENCES messages(id),
    token_count INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_context_summaries_session_id ON context_summaries(session_id);

-- ===========================================
-- 5. Context Anchors
-- ===========================================
CREATE TABLE IF NOT EXISTS context_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    anchor_text TEXT NOT NULL,
    anchor_type TEXT NOT NULL DEFAULT 'decision'
        CHECK (anchor_type IN ('fact', 'decision', 'constraint')),
    source_message_id UUID REFERENCES messages(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_context_anchors_session_id ON context_anchors(session_id);

-- ===========================================
-- 6. Prompt Templates
-- ===========================================
CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompt_templates_user_id ON prompt_templates(user_id);
CREATE INDEX idx_prompt_templates_public ON prompt_templates(is_public) WHERE is_public = TRUE;

-- ===========================================
-- Row Level Security (RLS) Policies
-- ===========================================

-- Profiles: users can only read/update their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE USING (auth.uid() = id);

-- Chat Sessions: users can CRUD their own sessions
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sessions"
    ON chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sessions"
    ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions"
    ON chat_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions"
    ON chat_sessions FOR DELETE USING (auth.uid() = user_id);

-- Messages: users can CRUD messages in their own sessions
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own messages"
    ON messages FOR SELECT USING (
        EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = messages.session_id AND chat_sessions.user_id = auth.uid())
    );
CREATE POLICY "Users can create messages in own sessions"
    ON messages FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = messages.session_id AND chat_sessions.user_id = auth.uid())
    );

-- Context Summaries: read via session ownership
ALTER TABLE context_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own summaries"
    ON context_summaries FOR SELECT USING (
        EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = context_summaries.session_id AND chat_sessions.user_id = auth.uid())
    );
CREATE POLICY "Users can create summaries in own sessions"
    ON context_summaries FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = context_summaries.session_id AND chat_sessions.user_id = auth.uid())
    );

-- Context Anchors: read via session ownership
ALTER TABLE context_anchors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own anchors"
    ON context_anchors FOR SELECT USING (
        EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = context_anchors.session_id AND chat_sessions.user_id = auth.uid())
    );
CREATE POLICY "Users can create anchors in own sessions"
    ON context_anchors FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = context_anchors.session_id AND chat_sessions.user_id = auth.uid())
    );

-- Prompt Templates: users can CRUD own, read public
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own templates"
    ON prompt_templates FOR SELECT USING (auth.uid() = user_id OR is_public = TRUE);
CREATE POLICY "Users can create own templates"
    ON prompt_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates"
    ON prompt_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates"
    ON prompt_templates FOR DELETE USING (auth.uid() = user_id);

-- ===========================================
-- Updated At Trigger
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_prompt_templates_updated_at
    BEFORE UPDATE ON prompt_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
