-- Initial schema for the Restaurant Recommendation System.
-- Spec from GPT-6/Samir (CoBase). Stores Google place IDs only, never other Places data.

-- ── Profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── User preferences ────────────────────────────────────────────────────────
create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  radius_km numeric not null default 10 check (radius_km > 0 and radius_km <= 50),
  cuisines text[] not null default '{}',
  price_levels integer[] not null default '{}' check (price_levels <@ array[1, 2, 3, 4]),
  dietary text[] not null default '{}',
  minimum_rating numeric check (minimum_rating between 0 and 5),
  open_now boolean not null default false,
  weights jsonb not null default '{"rating": 0.4, "distance": 0.3, "match": 0.3}',
  updated_at timestamptz not null default now()
);

-- ── Favorites ───────────────────────────────────────────────────────────────
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- ── Feedback ────────────────────────────────────────────────────────────────
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id text not null,
  rating integer check (rating between 1 and 5),
  helpful boolean,
  notes text,
  created_at timestamptz not null default now()
);

create index feedback_user_id_idx on public.feedback (user_id);
create index feedback_place_id_idx on public.feedback (place_id);

-- ── Row level security: users only see and change their own rows ───────────
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.favorites enable row level security;
alter table public.feedback enable row level security;

create policy "profiles: select own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: delete own" on public.profiles
  for delete using ((select auth.uid()) = id);

create policy "user_preferences: select own" on public.user_preferences
  for select using ((select auth.uid()) = user_id);
create policy "user_preferences: insert own" on public.user_preferences
  for insert with check ((select auth.uid()) = user_id);
create policy "user_preferences: update own" on public.user_preferences
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_preferences: delete own" on public.user_preferences
  for delete using ((select auth.uid()) = user_id);

create policy "favorites: select own" on public.favorites
  for select using ((select auth.uid()) = user_id);
create policy "favorites: insert own" on public.favorites
  for insert with check ((select auth.uid()) = user_id);
create policy "favorites: update own" on public.favorites
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "favorites: delete own" on public.favorites
  for delete using ((select auth.uid()) = user_id);

create policy "feedback: select own" on public.feedback
  for select using ((select auth.uid()) = user_id);
create policy "feedback: insert own" on public.feedback
  for insert with check ((select auth.uid()) = user_id);
create policy "feedback: update own" on public.feedback
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "feedback: delete own" on public.feedback
  for delete using ((select auth.uid()) = user_id);
