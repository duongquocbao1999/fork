-- forks.wiki 4.3.1: Season 1's ladder, final. A coin earns its dev nothing for being created alone — the
-- launch reward needs a buy at launch (the dev's own SOL, bought in the same Jito bundle as the coin, so it
-- landed if the coin did). Then the market cap pays, and migrating from the curve pays most of all:
--   launched with a dev buy +1,000 · $10K +10,000 · $30K +20,000 · migrated +50,000 · $100K +100,000 ·
--   $500K +250,000 · $1M +500,000 — up to 931,000 $FORK a coin.
-- Run after 0006_season1.sql. Safe to run more than once — but it sets the ladder back to these numbers.
-- Rewards already credited don't change.

alter table public.launches add column if not exists dev_buy_lamports bigint;

insert into season_tiers (season, id, label, mcap, reward, sort) values
  (1, 'launch',  'Launched with a dev buy',  null,    1000,   0),
  (1, 'cap10k',  '$10K market cap',          10000,   10000,  1),
  (1, 'cap30k',  '$30K market cap',          30000,   20000,  2),
  (1, 'grad',    'Migrated from the curve',  null,    50000,  3),
  (1, 'cap100k', '$100K market cap',         100000,  100000, 4),
  (1, 'cap500k', '$500K market cap',         500000,  250000, 5),
  (1, 'cap1m',   '$1M market cap',           1000000, 500000, 6)
on conflict (season, id) do update set label = excluded.label, mcap = excluded.mcap, reward = excluded.reward, sort = excluded.sort;

insert into app_config (key, value, note) values
  ('s1.min_dev_buy_sol', 0, 'Season 1: the smallest buy at launch (SOL) that earns the launch reward; 0 = any buy')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- the launch reward needs a dev buy
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
      -- a coin created alone earns nothing; with a buy at launch it does, a few launches a day
      if coalesce(l.dev_buy_lamports, 0) <= 0 or l.dev_buy_lamports < cfg('s1.min_dev_buy_sol', 0) * 1000000000 then continue; end if;
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

-- ---------------------------------------------------------------- after a launch is sent
-- what the server built and the wallet signed: the buy at launch (lamports, 0 = none) and, when someone
-- was signed in with X, who the dev is
create or replace function public.api_launch_sent(p_mint text, p_wallet text, p_user uuid, p_dev_buy bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update launches set dev_buy_lamports = greatest(coalesce(p_dev_buy, 0), 0), dev_user = coalesce(dev_user, p_user)
  where mint = p_mint and wallet = p_wallet;
  return jsonb_build_object('ok', found);
end $$;

-- a new attempt on a repo starts without a dev and without a buy
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
    reserved_until = excluded.reserved_until, created_at = now(), live_at = null, dev_user = null, dev_buy_lamports = null;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'mint_taken');
end $$;

-- the season page also says, per coin, whether it had a buy at launch
create or replace function public.api_season(p_user uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from seasons order by (starts_at <= now() and (ends_at is null or ends_at > now())) desc, id desc limit 1),
  earned as (
    select l.user_id, sum(l.amount)::bigint as amount from ledger l, s
    where l.idempotency_key like 's' || s.id || ':%' group by l.user_id),
  coins as (
    select coalesce(la.dev_user, d.user_id) as user_id, la.mint, la.symbol, la.repo_name, la.image, la.live_at, coalesce(la.dev_buy_lamports, 0) > 0 as dev_buy
    from launches la left join dev_wallets d on d.wallet = la.wallet, s
    where la.status = 'live' and la.live_at >= s.starts_at and (s.ends_at is null or la.live_at < s.ends_at)
      and not exists (select 1 from season_excluded e where e.wallet = la.wallet) and not launch_blocked(la.repo))
  select jsonb_build_object(
    'season', (select jsonb_build_object('id', id, 'name', name, 'startsAt', starts_at, 'endsAt', ends_at,
                 'open', starts_at <= now() and (ends_at is null or ends_at > now())) from s),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'mcap', t.mcap, 'reward', t.reward) order by t.sort), '[]'::jsonb)
              from season_tiers t, s where t.season = s.id),
    'rules', jsonb_build_object('perDay', cfg('s1.launch_per_day', 3)::int, 'minAgeDays', cfg('s1.min_age_days', 30)::int,
                                'confirmMinutes', cfg('s1.confirm_minutes', 10)::int, 'walletsMax', cfg('s1.wallets_max', 5)::int,
                                'minDevBuySol', cfg('s1.min_dev_buy_sol', 0)),
    'devs', (select count(distinct user_id) from coins where user_id is not null),
    'coins', (select count(*) from coins),
    'top', (select coalesce(jsonb_agg(x order by x.earned desc, x.coins desc), '[]'::jsonb) from (
              select p.x_username as handle, p.avatar_url as avatar, e.amount as earned,
                     (select count(*) from coins c where c.user_id = p.id) as coins
              from earned e join profiles p on p.id = e.user_id order by e.amount desc limit 20) x),
    'me', case when p_user is null then null else (select jsonb_build_object(
              'earned', coalesce((select amount from earned where user_id = p_user), 0),
              'wallets', (select coalesce(jsonb_agg(wallet order by linked_at), '[]'::jsonb) from dev_wallets where user_id = p_user),
              'coins', (select coalesce(jsonb_agg(jsonb_build_object('mint', c.mint, 'symbol', c.symbol, 'repo', c.repo_name, 'image', c.image, 'devBuy', c.dev_buy,
                          'earned', (select coalesce(sum(amount), 0) from ledger g, s where g.user_id = p_user and g.idempotency_key like 's' || s.id || ':%' || c.mint || '%'),
                          'tiers', (select coalesce(jsonb_agg(x.tier), '[]'::jsonb) from (
                            select 'launch' as tier from ledger g, s where g.user_id = p_user and g.idempotency_key = 's' || s.id || ':launch:' || c.mint
                            union all select q.tier from season_seen q where q.mint = c.mint and q.confirmed_at is not null) x))
                          order by c.live_at desc), '[]'::jsonb) from coins c where c.user_id = p_user))) end
  )
$$;

-- ---------------------------------------------------------------- lockdown, again
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

insert into meta (key, value) values ('schema', '7')
on conflict (key) do update set value = greatest(meta.value, excluded.value);
