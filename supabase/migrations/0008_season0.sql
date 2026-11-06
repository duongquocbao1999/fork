-- forks.wiki 4.4: the season is Season 0, with a pool of 200,000,000 $FORK; the $1M milestone pays +569,000
-- so a coin can earn exactly 1,000,000 (1,000 + 10,000 + 20,000 + 50,000 + 100,000 + 250,000 + 569,000).
-- When the pool runs out, nothing more is paid. The "ask upstream anything" trial is retired (five trials,
-- 9,000 together); what people already earned from it stays.
-- Run after 0007_season1_rewards.sql. Safe to run more than once.

alter table public.seasons add column if not exists pool bigint;
update seasons set name = 'Season 0', pool = coalesce(pool, 200000000) where id = 1;
update season_tiers set reward = 569000 where season = 1 and id = 'cap1m';

update tasks set active = false where id = 'chat';

-- ---------------------------------------------------------------- pay, while the pool lasts
create or replace function public.season_pay(p_mint text) returns int
language plpgsql security definer set search_path = public as $$
declare
  l launches%rowtype; s seasons%rowtype; dev uuid; p profiles%rowtype; t record; n int := 0; today int; paid bigint;
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

  -- one payer at a time, so two coins can't both take the pool's last tokens
  perform pg_advisory_xact_lock(hashtext('season_pool:' || s.id));
  select coalesce(sum(amount), 0) into paid from ledger where idempotency_key like 's' || s.id || ':%';

  for t in select * from season_tiers where season = s.id order by sort loop
    if s.pool is not null and paid + t.reward > s.pool then continue; end if;
    if t.id = 'launch' then
      -- a coin created alone earns nothing; with a buy at launch it does, a few launches a day
      if coalesce(l.dev_buy_lamports, 0) <= 0 or l.dev_buy_lamports < cfg('s1.min_dev_buy_sol', 0) * 1000000000 then continue; end if;
      select count(*) into today from ledger
      where user_id = dev and idempotency_key like 's' || s.id || ':launch:%' and created_at > now() - interval '1 day';
      if today < cfg('s1.launch_per_day', 3) and credit(dev, t.reward, 's' || s.id || '_launch', 's' || s.id || ':launch:' || p_mint) then n := n + 1; paid := paid + t.reward; end if;
    elsif exists (select 1 from season_seen where mint = p_mint and tier = t.id and confirmed_at is not null
                  and (s.ends_at is null or confirmed_at < s.ends_at)) then
      if credit(dev, t.reward, 's' || s.id || '_cap', 's' || s.id || ':cap:' || p_mint || ':' || t.id) then n := n + 1; paid := paid + t.reward; end if;
    end if;
  end loop;
  return n;
end $$;

-- the season page: the pool and what's been paid from it
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
    'season', (select jsonb_build_object('id', id, 'name', name, 'startsAt', starts_at, 'endsAt', ends_at, 'pool', pool,
                 'paid', (select coalesce(sum(amount), 0) from earned),
                 'open', starts_at <= now() and (ends_at is null or ends_at > now())
                         and (pool is null or (select coalesce(sum(amount), 0) from earned) < pool)) from s),
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

insert into meta (key, value) values ('schema', '8')
on conflict (key) do update set value = greatest(meta.value, excluded.value);
