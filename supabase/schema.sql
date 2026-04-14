create extension if not exists pgcrypto;

create table if not exists public.vanta_conversations (
  id uuid primary key,
  user_id text not null,
  title text not null,
  model text not null,
  system_prompt text not null,
  research_mode boolean not null default false,
  messages jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  public_token uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vanta_conversations_user_id_idx
  on public.vanta_conversations (user_id, updated_at desc);

create index if not exists vanta_conversations_public_token_idx
  on public.vanta_conversations (public_token);

create table if not exists public.vanta_workspace_state (
  user_id text primary key,
  active_conversation_id uuid,
  usage_timestamps jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
