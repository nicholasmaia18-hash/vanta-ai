import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let browserClient = null;

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined" || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  return browserClient;
}

export function getSupabaseAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function mapConversationRecord(record) {
  return {
    id: record.id,
    title: record.title,
    model: record.model,
    systemPrompt: record.system_prompt,
    researchMode: Boolean(record.research_mode),
    messages: Array.isArray(record.messages) ? record.messages : [],
    createdAt: new Date(record.created_at).getTime(),
    updatedAt: new Date(record.updated_at).getTime(),
    publicToken: record.public_token || null,
    shared: Boolean(record.is_public),
  };
}

export function mapConversationToRecord(userId, conversation) {
  const now = new Date();

  return {
    id: conversation.id,
    user_id: userId,
    title: conversation.title,
    model: conversation.model,
    system_prompt: conversation.systemPrompt,
    research_mode: Boolean(conversation.researchMode),
    messages: conversation.messages,
    public_token: conversation.publicToken || null,
    is_public: Boolean(conversation.shared || conversation.publicToken),
    created_at: new Date(conversation.createdAt || now).toISOString(),
    updated_at: new Date(conversation.updatedAt || now).toISOString(),
  };
}

export function sortConversations(conversations = []) {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function mergeConversations(localConversations = [], remoteConversations = []) {
  const merged = new Map();

  for (const conversation of [...localConversations, ...remoteConversations]) {
    const existing = merged.get(conversation.id);

    if (!existing || conversation.updatedAt > existing.updatedAt) {
      merged.set(conversation.id, conversation);
    }
  }

  return sortConversations(Array.from(merged.values()));
}

export function getPublicAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vanta-ai-chat.vercel.app";
}
