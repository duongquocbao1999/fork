-- forks.wiki 3.3: read the X account on first sign-in and fork it a one-time pending $FORK allocation;
-- trials worth 10,000 in total; how many traces each account made and how many repos it saw.
-- Run after 0001_init.sql. Self-contained and safe to run more than once.

-- ---------------------------------------------------------------- columns
alter table public.profiles add column if not exists following     int;
alter table public.profiles add column if not exists tweets        int;
alter table public.profiles add column if not exists listed        int;
alter table public.profiles add column if not exists verified      boolean not null default false;
alter table public.profiles add column if not exists verified_type text;
alter table public.profiles add column if not exists scan          jsonb;      -- { lines: [{k, n, amount}], total }
alter table public.profiles add column if not exists scan_seen     boolean not null default false;
alter table public.profiles add column if not exists traces        int not null default 0;
alter table public.profiles add column if not exists repos_seen    bigint not null default 0;

-- ---------------------------------------------------------------- tuning
-- Reward knobs, editable in the SQL editor without a deploy: insert/update a key to override its default.
create table if not exists public.app_config (key text primary key, value numeric not null, note text);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

create or replace function public.cfg(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_config where key = p_key), p_default)
$$;

-- ---------------------------------------------------------------- the scan
-- What an account is worth, in lines that add up. Each part saturates on its own (age linearly,
-- the counts on a log scale); an account that adds up to little still gets the floor through a
-- "first fork" line; the total is capped. Amounts are multiples of 50. Defaults below, knobs in app_config.
create or replace function public.scan_lines(p_created timestamptz, p_followers int, p_tweets int, p_listed int, p_verified boolean)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  yrs numeric := greatest(0, extract(epoch from (now() - coalesce(p_created, now()))) / 31557600);
  a int := (round(least(yrs / cfg('scan.age_years', 12), 1) * cfg('scan.age', 4000) / 50) * 50)::int;
  f int := (round(least(1, log(greatest(coalesce(p_followers, 0), 0) + 1) / cfg('scan.followers_log', 5)) * cfg('scan.followers', 8000) / 50) * 50)::int;
  t int := (round(least(1, log(greatest(coalesce(p_tweets, 0), 0) + 1) / cfg('scan.posts_log', 4.5)) * cfg('scan.posts', 3500) / 50) * 50)::int;
  l int := (round(least(1, log(greatest(coalesce(p_listed, 0), 0) + 1) / cfg('scan.lists_log', 3)) * cfg('scan.lists', 2500) / 50) * 50)::int;
  v int := case when p_verified then cfg('scan.verified', 2000)::int else 0 end;
  floor_ int := cfg('scan.floor', 2000)::int;
  lines jsonb;
  total int;
begin
  lines := jsonb_build_array(
    jsonb_build_object('k', 'age', 'n', round(yrs, 1), 'amount', a),
    jsonb_build_object('k', 'followers', 'n', coalesce(p_followers, 0), 'amount', f),
    jsonb_build_object('k', 'posts', 'n', coalesce(p_tweets, 0), 'amount', t),
    jsonb_build_object('k', 'lists', 'n', coalesce(p_listed, 0), 'amount', l));
  if v > 0 then lines := lines || jsonb_build_array(jsonb_build_object('k', 'verified', 'n', 1, 'amount', v)); end if;
  total := a + f + t + l + v;
  if total < floor_ then
    lines := lines || jsonb_build_array(jsonb_build_object('k', 'first', 'n', 0, 'amount', floor_ - total));
    total := floor_;
  end if;
  return jsonb_build_object('lines', lines, 'total', least(total, cfg('scan.cap', 20000)::int));
end $$;

-- ---------------------------------------------------------------- sign-in, now with the scan
drop function if exists public.upsert_x_user(text, text, text, text, timestamptz, int);
create or replace function public.upsert_x_user(
  p_x_id text, p_username text, p_name text, p_avatar text,
  p_x_created_at timestamptz default null, p_followers int default null, p_following int default null,
  p_tweets int default null, p_listed int default null, p_verified boolean default false, p_verified_type text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  s jsonb;
begin
  insert into profiles (x_id, x_username, display_name, avatar_url, x_created_at, followers, following, tweets, listed, verified, verified_type)
  values (p_x_id, lower(p_username), p_name, p_avatar, p_x_created_at, p_followers, p_following, p_tweets, p_listed, coalesce(p_verified, false), p_verified_type)
  on conflict (x_id) do update set
    x_username = excluded.x_username, display_name = excluded.display_name, avatar_url = excluded.avatar_url,
    x_created_at = coalesce(excluded.x_created_at, profiles.x_created_at),
    followers = coalesce(excluded.followers, profiles.followers), following = coalesce(excluded.following, profiles.following),
    tweets = coalesce(excluded.tweets, profiles.tweets), listed = coalesce(excluded.listed, profiles.listed),
    verified = excluded.verified, verified_type = excluded.verified_type, last_seen = now()
  returning id into pid;

  -- the scan happens once per account, at its first sign-in. The ledger key makes it once for sure:
  -- the lines are kept (and played back on the page) only when this call is the one that paid.
  if (select scan from profiles where id = pid) is null then
    s := scan_lines(p_x_created_at, p_followers, p_tweets, p_listed, coalesce(p_verified, false) or coalesce(p_verified_type, 'none') not in ('none', ''));
    if credit(pid, (s ->> 'total')::int, 'X scan', 'scan:' || pid) then
      update profiles set scan = s, scan_seen = false where id = pid;
    end if;
  end if;
  return pid;
end $$;

create or replace function public.api_scan_seen(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update profiles set scan_seen = true where id = p_user;
  return jsonb_build_object('ok', true);
end $$;

-- trees grown by this account: a stat for the summary card, never a reward.
-- One at a time, or the ones grown before sign-in in one go; at most 25 trees and 20 repos a tree per call.
drop function if exists public.api_note_trace(uuid, int);
create or replace function public.api_note_trace(p_user uuid, p_repos int, p_traces int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n int := least(greatest(coalesce(p_traces, 1), 1), 25);
  r int := least(greatest(coalesce(p_repos, 0), 0), 20 * n);
  p profiles%rowtype;
begin
  update profiles set traces = traces + n, repos_seen = repos_seen + r
  where id = p_user returning * into p;
  return jsonb_build_object('ok', found, 'traces', p.traces, 'reposSeen', p.repos_seen);
end $$;

create or replace function public.api_me(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'user', jsonb_build_object('username', p.x_username, 'name', p.display_name, 'avatar', p.avatar_url),
    'allocation', p.allocation,
    'wallet', p.wallet,
    'scan', p.scan,
    'scanSeen', p.scan_seen,
    'scanTotal', (select coalesce(sum(amount), 0) from ledger l where l.user_id = p.id and l.idempotency_key like 'scan:%'),
    'tasksTotal', (select coalesce(sum(amount), 0) from ledger l where l.user_id = p.id and l.idempotency_key like 'task:%'),
    'traces', p.traces,
    'reposSeen', p.repos_seen,
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'type', t.type, 'reward', t.reward, 'waitSec', t.min_wait_sec,
        'openedAt', c.opened_at, 'completedAt', c.completed_at) order by t.sort), '[]'::jsonb)
      from tasks t left join task_completions c on c.task_id = t.id and c.user_id = p.id where t.active),
    'now', now()
  ) from profiles p where p.id = p_user
$$;

-- ---------------------------------------------------------------- the trials: 10,000 in total
-- only on the way up from schema 1, so re-running this file after a later migration changes nothing
update tasks set reward = case id when 'follow' then 3000 when 'like' then 2000 when 'repost' then 2500 when 'comment' then 2500 else reward end
where coalesce((select value from meta where key = 'schema'), '1') < '2';

-- ---------------------------------------------------------------- lockdown, again for the new table and functions
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

insert into meta (key, value) values ('schema', '2')
on conflict (key) do update set value = greatest(meta.value, excluded.value);
