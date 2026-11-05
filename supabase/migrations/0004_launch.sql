-- forks.wiki 3.5: coins on repositories (pump.fun). One coin per repository; a wallet may start a few a day;
-- a coin is listed only after the server has read its locked split back from the chain.
-- Run after 0003_refs.sql. Self-contained and safe to run more than once.

create table if not exists public.launches (
  repo         text primary key,                -- owner/name, lowercased
  repo_name    text not null,                   -- as GitHub spells it
  mint         text unique,
  symbol       text not null,
  name         text not null,
  uri          text,
  image        text,
  wallet       text not null,                   -- who launched it (paid for it)
  split        jsonb not null,                  -- the holders the server planned, as locked on-chain
  status       text not null default 'reserved' check (status in ('reserved', 'live', 'mismatch')),
  reserved_until timestamptz,
  created_at   timestamptz not null default now(),
  live_at      timestamptz
);
create index if not exists launches_wallet_idx on public.launches (wallet, created_at desc);
create index if not exists launches_live_idx on public.launches (status) where status = 'live';

-- launch attempts, for the per-wallet daily limit (repositories per day; a reservation that never landed still counts)
create table if not exists public.launch_attempts (
  id         bigint generated always as identity primary key,
  wallet     text not null,
  repo       text not null,
  created_at timestamptz not null default now()
);
create index if not exists launch_attempts_wallet_idx on public.launch_attempts (wallet, created_at desc);

-- owners who asked not to have coins launched on their code: 'owner' or 'owner/name', lowercased.
-- A coin already on the chain stays there, but forks.wiki stops listing it.
create table if not exists public.launch_blocklist (
  pattern    text primary key,
  reason     text,
  created_at timestamptz not null default now()
);

alter table public.launches         enable row level security;
alter table public.launch_attempts  enable row level security;
alter table public.launch_blocklist enable row level security;

create or replace function public.launch_blocked(p_repo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from launch_blocklist where pattern = lower(p_repo) or pattern = split_part(lower(p_repo), '/', 1))
$$;

-- what the page needs before a launch: is there a coin already, is the repo closed
create or replace function public.api_launch_state(p_repo text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'blocked', launch_blocked(p_repo),
    'coin', (select jsonb_build_object('mint', mint, 'symbol', symbol, 'name', name, 'image', image, 'status', status)
             from launches where repo = lower(p_repo) and (status = 'live' or reserved_until > now())))
$$;

-- hold the repo for one wallet while its bundle is in flight (10 minutes)
create or replace function public.api_launch_reserve(p_repo text, p_repo_name text, p_wallet text, p_mint text,
  p_symbol text, p_name text, p_uri text, p_image text, p_split jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l launches%rowtype;
  n int;
begin
  if launch_blocked(p_repo) then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;
  -- repositories, not tries: signing again after a rejected or dropped bundle doesn't use up the day
  select count(distinct repo) into n from launch_attempts
  where wallet = p_wallet and created_at > now() - interval '1 day' and repo <> lower(p_repo);
  if n >= cfg('launch.per_day', 3) then return jsonb_build_object('ok', false, 'error', 'daily_limit'); end if;
  select * into l from launches where repo = lower(p_repo) for update;
  if found and (l.status = 'live' or (l.status = 'reserved' and l.reserved_until > now() and l.wallet <> p_wallet)) then
    return jsonb_build_object('ok', false, 'error', case when l.status = 'live' then 'taken' else 'in_flight' end);
  end if;
  insert into launch_attempts (wallet, repo) values (p_wallet, lower(p_repo));
  insert into launches (repo, repo_name, mint, symbol, name, uri, image, wallet, split, status, reserved_until)
  values (lower(p_repo), p_repo_name, p_mint, p_symbol, p_name, p_uri, p_image, p_wallet, p_split, 'reserved', now() + interval '10 minutes')
  on conflict (repo) do update set repo_name = excluded.repo_name, mint = excluded.mint, symbol = excluded.symbol, name = excluded.name,
    uri = excluded.uri, image = excluded.image, wallet = excluded.wallet, split = excluded.split, status = 'reserved',
    reserved_until = excluded.reserved_until, created_at = now(), live_at = null;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'mint_taken');
end $$;

create or replace function public.api_launch_get(p_mint text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(l) - 'uri' from launches l where mint = p_mint
$$;

-- the chain says the coin is there with our split, locked
create or replace function public.api_launch_settle(p_mint text, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l launches%rowtype;
begin
  if p_status not in ('live', 'mismatch') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  update launches set status = p_status, live_at = case when p_status = 'live' then now() else live_at end, reserved_until = null
  where mint = p_mint and status <> 'live' returning * into l;
  return jsonb_build_object('ok', found);
end $$;

-- coins on the repositories of a tree (only live ones)
create or replace function public.api_tokens(p_repos text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('repo', repo_name, 'mint', mint, 'symbol', symbol, 'name', name, 'image', image,
    'split', split, 'live_at', live_at) order by live_at), '[]'::jsonb)
  from launches where status = 'live' and repo = any (select lower(x) from unnest(p_repos) x) and not launch_blocked(repo)
$$;

-- the newest coins, for a ticker on the site
create or replace function public.api_tokens_recent(p_limit int default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select repo_name as repo, mint, symbol, name, image, live_at from launches
    where status = 'live' and not launch_blocked(repo) order by live_at desc limit least(greatest(p_limit, 1), 50)) t
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

insert into meta (key, value) values ('schema', '4')
on conflict (key) do update set value = greatest(meta.value, excluded.value);
