-- Schema for the literature chatbot project, generated from the final ERD.
-- Target: PostgreSQL 13+ (gen_random_uuid() is a core built-in from PG13 on,
-- so no CREATE EXTENSION is needed on Supabase or any recent Postgres).
--
-- Note: the ERD has no many-to-many relationships (User->Conversation and
-- Topic->Conversation are both one-to-many, Conversation->Message is
-- one-to-many), so no junction table is needed here.

-- Reset: drops the earlier BIGINT-keyed version of these tables so this
-- UUID-keyed version can be created in their place. CASCADE also drops
-- their indexes and FK constraints. This permanently deletes any rows
-- currently in these tables -- confirm they're empty before running.
DROP TABLE IF EXISTS messages, conversations, topics, users CASCADE;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    topic_id UUID NOT NULL REFERENCES topics(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    sender TEXT NOT NULL CHECK (sender IN ('user', 'bot')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postgres doesn't auto-index foreign key columns, so add them explicitly
-- for any lookup/join by user, topic, or conversation.
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_topic_id ON conversations(topic_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
