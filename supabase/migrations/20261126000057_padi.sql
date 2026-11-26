-- Bizz Padi (26 Nov 2026): an AI content and growth assistant for small businesses.
-- Part of the Workbase family (same accounts as Workbase, Meet, Book and Forms), with its own
-- web address later (NEXT_PUBLIC_PADI_URL); until then it lives at /padi on the app address.
--
-- Phase 1 stores three things, all private to the person who owns them:
--   padi_brands    the business profile Padi writes for (name, what they sell, audience, tone, colours…)
--   padi_posts     post ideas Padi wrote: captions per platform, flyer text, planned time, status
--   padi_messages  the chat between the owner and Padi
--
-- Nobody else can read any of it (not Workbase company admins, not other users). The AI is
-- called only from our server (lib/padi/ai.ts) with the owner's own login, so RLS still applies
-- to every read and write. Meet guests (anonymous logins) can't use Padi.

-- ---------------------------------------------------------------------------
-- Brand profile: one per person in phase 1 (agencies with many brands come later).
-- ---------------------------------------------------------------------------
create table public.padi_brands (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 80),
  industry    text not null default '' check (char_length(industry) <= 80),
  about       text not null default '' check (char_length(about) <= 1500),   -- what they sell, prices, what makes them different
  audience    text not null default '' check (char_length(audience) <= 600), -- who buys
  location    text not null default '' check (char_length(location) <= 120),
  tone        text not null default 'friendly' check (tone in ('friendly', 'professional', 'playful', 'naija', 'luxury', 'warm')),
  colors      jsonb not null default '{"primary":"#6a4cf5","accent":"#f2a93b"}'::jsonb
                check (jsonb_typeof(colors) = 'object' and pg_column_size(colors) <= 400),
  platforms   text[] not null default array['instagram', 'facebook', 'whatsapp']::text[]
                check (platforms <@ array['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'whatsapp']::text[]),
  contact     text not null default '' check (char_length(contact) <= 160),  -- phone / WhatsApp / website shown on flyers
  posts_per_week smallint not null default 3 check (posts_per_week between 1 and 14),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Posts Padi wrote. `captions` = {instagram: "...", facebook: "...", ...};
-- `flyer` = {headline, subline, cta, style}; both are written only by our server code.
-- ---------------------------------------------------------------------------
create table public.padi_posts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id      uuid not null references public.padi_brands (id) on delete cascade,
  topic         text not null check (char_length(trim(topic)) between 1 and 300),
  captions      jsonb not null default '{}'::jsonb check (jsonb_typeof(captions) = 'object' and pg_column_size(captions) <= 20000),
  hashtags      text[] not null default '{}'::text[] check (cardinality(hashtags) <= 15),
  flyer         jsonb not null default '{}'::jsonb check (jsonb_typeof(flyer) = 'object' and pg_column_size(flyer) <= 4000),
  planned_for   timestamptz,
  status        text not null default 'draft' check (status in ('draft', 'approved', 'posted', 'skipped')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index padi_posts_owner_idx on public.padi_posts (owner_id, planned_for);
create index padi_posts_brand_idx on public.padi_posts (brand_id);

-- ---------------------------------------------------------------------------
-- Chat history. Assistant messages may point at the post they produced.
-- ---------------------------------------------------------------------------
create table public.padi_messages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) between 1 and 8000),
  post_id     uuid references public.padi_posts (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index padi_messages_owner_idx on public.padi_messages (owner_id, created_at desc);
create index padi_messages_post_idx on public.padi_messages (post_id);

-- ---------------------------------------------------------------------------
-- Guards: owner and timestamps always come from the login; guests refused; updated_at kept.
-- ---------------------------------------------------------------------------
create or replace function private.guard_padi_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
      raise exception 'Sign in with your account to use Bizz Padi.';
    end if;
    if tg_op = 'INSERT' then
      new.owner_id := auth.uid();
    elsif new.owner_id is distinct from old.owner_id then
      raise exception 'You can''t move this to someone else.';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  if tg_table_name <> 'padi_messages' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger padi_brands_guard before insert or update on public.padi_brands
  for each row execute function private.guard_padi_row();
create trigger padi_posts_guard before insert or update on public.padi_posts
  for each row execute function private.guard_padi_row();
create trigger padi_messages_guard before insert or update on public.padi_messages
  for each row execute function private.guard_padi_row();

-- A post's brand must belong to the same person.
create or replace function private.guard_padi_post_brand()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.padi_brands b where b.id = new.brand_id and b.owner_id = new.owner_id) then
    raise exception 'That brand isn''t yours.';
  end if;
  return new;
end $$;
create trigger padi_posts_brand_check before insert or update of brand_id, owner_id on public.padi_posts
  for each row execute function private.guard_padi_post_brand();

-- Rate limits (the same helper every other product uses): chat 120 messages (60 exchanges)/hour, new posts 120/day.
create trigger padi_messages_rate before insert on public.padi_messages
  for each row execute function private.rate_guard('padi_messages', '120', '3600');
create trigger padi_posts_rate before insert on public.padi_posts
  for each row execute function private.rate_guard('padi_posts', '120', '86400');

-- ---------------------------------------------------------------------------
-- Row level security: owner only. Column grants keep owner/timestamps out of reach.
-- ---------------------------------------------------------------------------
alter table public.padi_brands enable row level security;
alter table public.padi_posts enable row level security;
alter table public.padi_messages enable row level security;

revoke all on public.padi_brands, public.padi_posts, public.padi_messages from anon, authenticated;

grant select, delete on public.padi_brands, public.padi_posts, public.padi_messages to authenticated;
grant insert (name, industry, about, audience, location, tone, colors, platforms, contact, posts_per_week),
      update (name, industry, about, audience, location, tone, colors, platforms, contact, posts_per_week)
  on public.padi_brands to authenticated;
grant insert (brand_id, topic, captions, hashtags, flyer, planned_for, status),
      update (topic, captions, hashtags, flyer, planned_for, status)
  on public.padi_posts to authenticated;
grant insert (role, content, post_id) on public.padi_messages to authenticated;

create policy padi_brands_own on public.padi_brands for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy padi_posts_own on public.padi_posts for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy padi_messages_own on public.padi_messages for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
