-- forks.wiki 4.3: Season 1 — $FORK for the people who launch coins on repositories.
-- A coin launched here earns its dev a fixed reward once it is live, and more as its market cap passes
-- milestones. Everything is credited by the server through credit() (the ledger, one idempotency key per
-- reward): the page never sends an amount, a market cap or a user. Market caps are measured by the server
-- (scheduled every 10 minutes: the curve on the chain, or DexScreener's consensus price) and a milestone
-- counts once it has been seen twice, at least 10 minutes apart; graduating from the curve is read from the chain.
--
-- Who is the dev: the X account signed in when the launch was sent (its wallet signed the coin), or the X
-- account that later proved the launching wallet by signing a message with it.
-- Run after 0005_github.sql. Self-contained and safe to run more than once.

-- ---------------------------------------------------------------- tables
create table if not exists public.seasons (
  id        int primary key,
  name      text not null,
  starts_at timestamptz not null,
  ends_at   timestamptz                          -- null: open until announced
);
insert into seasons (id, name, starts_at) values (1, 'Season 1', now()) on conflict (id) do nothing;

-- what a coin earns its dev. 'launch' lands when the coin is live; 'grad' when the chain says its curve is
-- complete; the rest when the market cap (USD) has been seen at or above `mcap` twice, 10+ minutes apart.
create table if not exists public.season_tiers (
  season int  not null references public.seasons (id) on delete cascade,
  id     text not null,
  label  text not null,
  mcap   numeric,
  reward int  not null check (reward >= 0),
  sort   int  not null default 0,
  primary key (season, id)
);
insert into season_tiers (season, id, label, mcap, reward, sort) values
  (1, 'launch',  'Coin launched',            null,    5000,   0),
  (1, 'cap10k',  '$10K market cap',          10000,   5000,   1),
  (1, 'cap30k',  '$30K market cap',          30000,   10000,  2),
  (1, 'grad',    'Graduated from the curve', null,    25000,  3),
  (1, 'cap100k', '$100K market cap',         100000,  25000,  4),
  (1, 'cap500k', '$500K market cap',         500000,  75000,  5),
  (1, 'cap1m',   '$1M market cap',           1000000, 150000, 6)
on conflict (season, id) do nothing;

-- the server's observations: when a coin first reached a tier, and when that was confirmed
create table if not exists public.season_seen (
  mint         text not null,
  tier         text not null,
  first_at     timestamptz not null default now(),
  confirmed_at timestamptz,
  primary key (mint, tier)
);

-- wallets that never earn (forks' own)
create table if not exists public.season_excluded (wallet text primary key, note text);
insert into season_excluded (wallet, note) values ('61468ik7HhYNg8ixQYeF9caMNVm57PqTy3tyQ28F6Y5e', 'forks treasury')
on conflict (wallet) do nothing;

-- wallets proven by a signed message: one X account per wallet, for good
create table if not exists public.dev_wallets (
  wallet    text primary key,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index if not exists dev_wallets_user_idx on public.dev_wallets (user_id);

alter table public.launches add column if not exists dev_user uuid references public.profiles (id) on delete set null;
create index if not exists launches_dev_idx on public.launches (dev_user) where dev_user is not null;

alter table public.seasons         enable row level security;
alter table public.season_tiers    enable row level security;
alter table public.season_seen     enable row level security;
alter table public.season_excluded enable row level security;
alter table public.dev_wallets     enable row level security;

insert into app_config (key, value, note) values
  ('s1.launch_per_day', 3,  'Season 1: launches a day that earn the launch reward, per X account'),
  ('s1.min_age_days',   30, 'Season 1: X account age (days) to earn'),
  ('s1.confirm_minutes', 10, 'Season 1: a market-cap milestone counts when seen again this many minutes later'),
  ('s1.wallets_max',    5,  'Season 1: wallets one X account may link')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- who earns for a coin
create or replace function public.season_dev(p_mint text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(l.dev_user, (select d.user_id from dev_wallets d where d.wallet = l.wallet))
  from launches l where l.mint = p_mint
$$;

-- the current season, if it is open
create or replace function public.season_now() returns seasons
language sql stable security definer set search_path = public as $$
  select * from seasons where starts_at <= now() and (ends_at is null or ends_at > now()) order by id desc limit 1
$$;

-- pay everything a coin has earned and not been paid yet (idempotent: one ledger key per reward)
create or replace function public.season_pay(p_mint text) returns int
language plpgsql security definer set search_path = public as $$
declare
  l launches%rowtype; s seasons%rowtype; dev uuid; p profiles%rowtype; t record; n int := 0; today int;
begin
  select * into l from launches where mint = p_mint;
  if not found or l.status <> 'live' or l.live_at is null then return 0; end if;
  select * into s from seasons where l.live_at >= starts_at and (ends_at is null or l.live_at < ends_at) order by id desc limit 1;
  if not found then return 0; end if;
  if exists (select 1 from season_excluded where wallet = l.wallet) or launch_blocked(l.repo) then return 0; end if;
  dev := season_dev(p_mint);
  if dev is null then return 0; end if;
  select * into p from profiles where id = dev;
  if p.x_created_at is not null and p.x_created_at > now() - make_interval(days => cfg('s1.min_age_days', 30)::int) then return 0; end if;

  for t in select * from season_tiers where season = s.id order by sort loop
    if t.id = 'launch' then
      -- a few launches a day earn the launch reward; milestones always count
      select count(*) into today from ledger
      where user_id = dev and idempotency_key like 's' || s.id || ':launch:%' and created_at > now() - interval '1 day';
      if today < cfg('s1.launch_per_day', 3) and credit(dev, t.reward, 's' || s.id || '_launch', 's' || s.id || ':launch:' || p_mint) then n := n + 1; end if;
    elsif exists (select 1 from season_seen where mint = p_mint and tier = t.id and confirmed_at is not null
                  and (s.ends_at is null or confirmed_at < s.ends_at)) then
      if credit(dev, t.reward, 's' || s.id || '_cap', 's' || s.id || ':cap:' || p_mint || ':' || t.id) then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- the server's calls
-- after a launch is sent: the signed-in X account whose wallet signed it (from the session, on the server)
create or replace function public.api_launch_attach(p_user uuid, p_mint text, p_wallet text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update launches set dev_user = p_user where mint = p_mint and wallet = p_wallet and dev_user is null;
  return jsonb_build_object('ok', found);
end $$;

-- the coins still counting this season, for the scheduled measurement
create or replace function public.api_season_watch() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('mint', l.mint) order by l.live_at desc), '[]'::jsonb)
  from launches l, seasons s
  where l.status = 'live' and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
    and l.live_at >= s.starts_at and not exists (select 1 from season_excluded e where e.wallet = l.wallet)
$$;

-- what the server measured: [{ mint, mcap (USD, or null), grad (curve complete, from the chain) }, …]
create or replace function public.api_season_observe(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; s seasons%rowtype; t record; m text; cap numeric; paid int := 0; wait interval;
begin
  s := season_now();
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'no_season'); end if;
  wait := make_interval(mins => cfg('s1.confirm_minutes', 10)::int);
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    m := it ->> 'mint';
    if m is null or not exists (select 1 from launches where mint = m and status = 'live') then continue; end if;
    cap := nullif(it ->> 'mcap', '')::numeric;
    for t in select * from season_tiers where season = s.id and id <> 'launch' order by sort loop
      if t.id = 'grad' then
        if coalesce((it ->> 'grad')::boolean, false) then
          insert into season_seen (mint, tier, first_at, confirmed_at) values (m, t.id, now(), now())
          on conflict (mint, tier) do update set confirmed_at = coalesce(season_seen.confirmed_at, now());
        end if;
      elsif t.mcap is not null and cap is not null and cap >= t.mcap then
        insert into season_seen (mint, tier) values (m, t.id) on conflict (mint, tier) do nothing;
        update season_seen set confirmed_at = now()
        where mint = m and tier = t.id and confirmed_at is null and first_at <= now() - wait;
      end if;
    end loop;
    paid := paid + season_pay(m);
  end loop;
  return jsonb_build_object('ok', true, 'paid', paid);
end $$;

-- a wallet proven by its signature (checked on the server) joins an X account; its coins count from then on
create or replace function public.api_dev_link(p_user uuid, p_wallet text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner uuid; n int; c int := 0; m text;
begin
  select user_id into owner from dev_wallets where wallet = p_wallet;
  if owner is not null and owner <> p_user then return jsonb_build_object('ok', false, 'error', 'wallet_taken'); end if;
  if owner is null then
    select count(*) into n from dev_wallets where user_id = p_user;
    if n >= cfg('s1.wallets_max', 5) then return jsonb_build_object('ok', false, 'error', 'too_many_wallets'); end if;
    if exists (select 1 from season_excluded where wallet = p_wallet) then return jsonb_build_object('ok', false, 'error', 'excluded'); end if;
    insert into dev_wallets (wallet, user_id) values (p_wallet, p_user);
  end if;
  for m in select mint from launches where wallet = p_wallet and status = 'live' and dev_user is null loop
    update launches set dev_user = p_user where mint = m;
    c := c + 1;
    perform season_pay(m);
  end loop;
  return jsonb_build_object('ok', true, 'coins', c);
end $$;

-- the season page: the rules, the top devs, and (signed in) your coins
create or replace function public.api_season(p_user uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from seasons order by (starts_at <= now() and (ends_at is null or ends_at > now())) desc, id desc limit 1),
  earned as (
    select l.user_id, sum(l.amount)::bigint as amount from ledger l, s
    where l.idempotency_key like 's' || s.id || ':%' group by l.user_id),
  coins as (
    select coalesce(la.dev_user, d.user_id) as user_id, la.mint, la.symbol, la.repo_name, la.image, la.live_at
    from launches la left join dev_wallets d on d.wallet = la.wallet, s
    where la.status = 'live' and la.live_at >= s.starts_at and (s.ends_at is null or la.live_at < s.ends_at)
      and not exists (select 1 from season_excluded e where e.wallet = la.wallet) and not launch_blocked(la.repo))
  select jsonb_build_object(
    'season', (select jsonb_build_object('id', id, 'name', name, 'startsAt', starts_at, 'endsAt', ends_at,
                 'open', starts_at <= now() and (ends_at is null or ends_at > now())) from s),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'mcap', t.mcap, 'reward', t.reward) order by t.sort), '[]'::jsonb)
              from season_tiers t, s where t.season = s.id),
    'rules', jsonb_build_object('perDay', cfg('s1.launch_per_day', 3)::int, 'minAgeDays', cfg('s1.min_age_days', 30)::int,
                                'confirmMinutes', cfg('s1.confirm_minutes', 10)::int, 'walletsMax', cfg('s1.wallets_max', 5)::int),
    'devs', (select count(distinct user_id) from coins where user_id is not null),
    'coins', (select count(*) from coins),
    'top', (select coalesce(jsonb_agg(x order by x.earned desc, x.coins desc), '[]'::jsonb) from (
              select p.x_username as handle, p.avatar_url as avatar, e.amount as earned,
                     (select count(*) from coins c where c.user_id = p.id) as coins
              from earned e join profiles p on p.id = e.user_id order by e.amount desc limit 20) x),
    'me', case when p_user is null then null else (select jsonb_build_object(
              'earned', coalesce((select amount from earned where user_id = p_user), 0),
              'wallets', (select coalesce(jsonb_agg(wallet order by linked_at), '[]'::jsonb) from dev_wallets where user_id = p_user),
              'coins', (select coalesce(jsonb_agg(jsonb_build_object('mint', c.mint, 'symbol', c.symbol, 'repo', c.repo_name, 'image', c.image,
                          'earned', (select coalesce(sum(amount), 0) from ledger g, s where g.user_id = p_user and g.idempotency_key like 's' || s.id || ':%' || c.mint || '%'),
                          'tiers', (select coalesce(jsonb_agg(x.tier), '[]'::jsonb) from (
                            select 'launch' as tier from ledger g, s where g.user_id = p_user and g.idempotency_key = 's' || s.id || ':launch:' || c.mint
                            union all select q.tier from season_seen q where q.mint = c.mint and q.confirmed_at is not null) x))
                          order by c.live_at desc), '[]'::jsonb) from coins c where c.user_id = p_user))) end
  )
$$;

-- ---------------------------------------------------------------- the launch functions, season-aware
-- a new attempt on a repo starts without a dev; the sending session attaches one
create or replace function public.api_launch_reserve(p_repo text, p_repo_name text, p_wallet text, p_mint text,
  p_symbol text, p_name text, p_uri text, p_image text, p_split jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l launches%rowtype;
  n int;
begin
  if launch_blocked(p_repo) then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;
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
    reserved_until = excluded.reserved_until, created_at = now(), live_at = null, dev_user = null;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'mint_taken');
end $$;

-- live: the launch reward lands right away (when the dev is known)
create or replace function public.api_launch_settle(p_mint text, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l launches%rowtype;
begin
  if p_status not in ('live', 'mismatch') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  update launches set status = p_status, live_at = case when p_status = 'live' then now() else live_at end, reserved_until = null
  where mint = p_mint and status <> 'live' returning * into l;
  if found and p_status = 'live' then perform season_pay(p_mint); end if;
  return jsonb_build_object('ok', found);
end $$;

-- ---------------------------------------------------------------- lockdown, again
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

insert into meta (key, value) values ('schema', '6')
on conflict (key) do update set value = greatest(meta.value, excluded.value);
