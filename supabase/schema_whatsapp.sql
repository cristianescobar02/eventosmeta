-- ============================================================
-- WhatsApp AI Sales Agent – Schema
-- Ejecuta en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Tabla: wa_conversations ──────────────────────────────────
create table public.wa_conversations (
  id                bigserial primary key,
  phone             text not null unique,
  wa_name           text,
  state             text not null default 'new',
  -- states: new | info_sent | payment_pending | proof_received
  --         proof_validated | email_received | completed | human_takeover
  payment_method    text,
  proof_url         text,
  customer_email    text,
  is_human_takeover boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index wa_conversations_phone_idx  on public.wa_conversations(phone);
create index wa_conversations_state_idx  on public.wa_conversations(state);
create index wa_conversations_updated_idx on public.wa_conversations(updated_at desc);

-- ── Tabla: wa_messages ───────────────────────────────────────
create table public.wa_messages (
  id               bigserial primary key,
  conversation_id  bigint references public.wa_conversations(id) on delete cascade not null,
  direction        text not null,      -- inbound | outbound
  msg_type         text not null default 'text',  -- text | image | audio | video | document
  content          text,
  media_url        text,
  wa_msg_id        text unique,
  created_at       timestamptz not null default now()
);

create index wa_messages_conv_idx    on public.wa_messages(conversation_id);
create index wa_messages_created_idx on public.wa_messages(created_at);

-- ── Trigger: updated_at ──────────────────────────────────────
create trigger wa_conversations_updated_at
  before update on public.wa_conversations
  for each row execute function public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.wa_conversations enable row level security;
alter table public.wa_messages       enable row level security;

-- Solo admins pueden acceder a las conversaciones de WhatsApp
create policy "wa_conversations_admin" on public.wa_conversations
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "wa_messages_admin" on public.wa_messages
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ── Realtime ─────────────────────────────────────────────────
alter publication supabase_realtime add table public.wa_conversations;
alter publication supabase_realtime add table public.wa_messages;
