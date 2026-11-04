-- forks.wiki: sign in with X + the /freeforks trials (pending $FORK allocation).
-- The browser never touches the database. Netlify functions call the api_* functions below over
-- REST with the service role key and pass the signed-in user from the session cookie.
-- Self-contained and safe to run more than once: paste into Supabase → SQL Editor → Run.

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid(),
  x_id         text unique not null,
  x_username   text not null,                 -- lowercased handle, refreshed on every sign-in
  display_name text,
  avatar_url   text,
  x_created_at timestamptz,
  followers    int,
  wallet       text unique,                   -- Solana address for the airdrop
  allocation   bigint not null default 0,     -- pending $FORK; cache of the ledger
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

create table if not exists public.tasks (
  id           text primary key,              -- 'follow', 'like', 'repost', 'comment'
  type         text not null,                 -- the page builds the X link from src/config.js by type
  reward       int  not null check (reward >= 0),
  min_wait_sec int  not null default 5,       -- server clock: claim only this long after opening
  active       boolean not null default true,
  sort         int  not null default 0
);

create table if not exists public.task_completions (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  task_id      text not null references public.tasks (id) on delete cascade,
  opened_at    timestamptz,
  completed_at timestamptz,
  primary key (user_id, task_id)
);

create table if not exists public.ledger (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  amount          int  not null check (amount > 0),
  reason          text not null,
  idempotency_key text not null unique,       -- a credit can only ever land once
  created_at      timestamptz not null default now()
);
create index if not exists ledger_user_idx on public.ledger (user_id, created_at desc);

create table if not exists public.meta (key text primary key, value text not null);

-- ---------------------------------------------------------------- helpers
-- The only way $FORK is ever allocated.
create or replace function public.credit(p_user uuid, p_amount int, p_reason text, p_key text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_amount <= 0 then return false; end if;
  insert into ledger (user_id, amount, reason, idempotency_key) values (p_user, p_amount, p_reason, p_key)
  on conflict (idempotency_key) do nothing;
  if not found then return false; end if;
  update profiles set allocation = allocation + p_amount where id = p_user;
  return true;
end $$;

-- ---------------------------------------------------------------- sign-in
create or replace function public.upsert_x_user(
  p_x_id text, p_username text, p_name text, p_avatar text,
  p_x_created_at timestamptz default null, p_followers int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  insert into profiles (x_id, x_username, display_name, avatar_url, x_created_at, followers)
  values (p_x_id, lower(p_username), p_name, p_avatar, p_x_created_at, p_followers)
  on conflict (x_id) do update set
    x_username = excluded.x_username, display_name = excluded.display_name, avatar_url = excluded.avatar_url,
    followers = coalesce(excluded.followers, profiles.followers), last_seen = now()
  returning id into pid;
  return pid;
end $$;

-- ---------------------------------------------------------------- trials
-- GO pressed: remember when the link was opened (server clock, first open wins).
create or replace function public.api_task_open(p_user uuid, p_task text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c task_completions%rowtype;
begin
  if not exists (select 1 from tasks where id = p_task and active) then
    return jsonb_build_object('ok', false, 'error', 'unknown_task');
  end if;
  insert into task_completions (user_id, task_id, opened_at) values (p_user, p_task, now())
  on conflict (user_id, task_id) do update set opened_at = coalesce(task_completions.opened_at, excluded.opened_at)
  returning * into c;
  return jsonb_build_object('ok', true, 'openedAt', c.opened_at, 'completedAt', c.completed_at, 'now', now());
end $$;

-- Credit a trial once, no sooner than min_wait_sec after it was opened.
create or replace function public.api_task_claim(p_user uuid, p_task text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tasks%rowtype;
  c task_completions%rowtype;
  total bigint;
  credited boolean;
begin
  select * into t from tasks where id = p_task and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_task'); end if;
  perform 1 from profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;
  select * into c from task_completions where user_id = p_user and task_id = p_task for update;
  if c.completed_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'reward', 0, 'allocation', (select allocation from profiles where id = p_user));
  end if;
  if c.opened_at is null then return jsonb_build_object('ok', false, 'error', 'not_opened'); end if;
  if now() - c.opened_at < make_interval(secs => t.min_wait_sec) then
    return jsonb_build_object('ok', false, 'error', 'too_early',
      'wait', extract(epoch from (c.opened_at + make_interval(secs => t.min_wait_sec) - now())));
  end if;

  update task_completions set completed_at = now() where user_id = p_user and task_id = p_task;
  credited := credit(p_user, t.reward, 'Trial: ' || t.id, 'task:' || p_user || ':' || p_task);
  select allocation into total from profiles where id = p_user;
  return jsonb_build_object('ok', true, 'reward', case when credited then t.reward else 0 end, 'allocation', total);
end $$;

-- ---------------------------------------------------------------- wallet
create or replace function public.api_set_wallet(p_user uuid, p_wallet text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_wallet');
  end if;
  if exists (select 1 from profiles where wallet = p_wallet and id <> p_user) then
    return jsonb_build_object('ok', false, 'error', 'wallet_taken');
  end if;
  update profiles set wallet = p_wallet where id = p_user;
  return jsonb_build_object('ok', true, 'wallet', p_wallet);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'wallet_taken');
end $$;

-- ---------------------------------------------------------------- reads
-- Kept cheap on purpose: no counts over profiles (glyph lesson: count(*) per /api/me took the database down).
create or replace function public.api_me(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'user', jsonb_build_object('username', p.x_username, 'name', p.display_name, 'avatar', p.avatar_url),
    'allocation', p.allocation,
    'wallet', p.wallet,
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'type', t.type, 'reward', t.reward, 'waitSec', t.min_wait_sec,
        'openedAt', c.opened_at, 'completedAt', c.completed_at) order by t.sort), '[]'::jsonb)
      from tasks t left join task_completions c on c.task_id = t.id and c.user_id = p.id where t.active),
    'now', now()
  ) from profiles p where p.id = p_user
$$;

create or replace function public.api_health() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'schema', (select value from meta where key = 'schema'),
    'tasks', (select count(*) from tasks where active))
$$;

-- ---------------------------------------------------------------- lockdown
alter table public.profiles         enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_completions enable row level security;
alter table public.ledger           enable row level security;
alter table public.meta             enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------- seed
-- 3,000 + 2,000 + 2,500 + 2,500 = 10,000 $FORK. Re-running updates the rows.
insert into tasks (id, type, reward, min_wait_sec, sort) values
  ('follow',  'follow',  3000, 5, 1),
  ('like',    'like',    2000, 5, 2),
  ('repost',  'repost',  2500, 5, 3),
  ('comment', 'comment', 2500, 5, 4)
on conflict (id) do nothing; -- later migrations own the amounts; re-running this one never resets them

insert into meta (key, value) values ('schema', '1')
on conflict (key) do update set value = greatest(meta.value, excluded.value);
