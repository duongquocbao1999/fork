-- forks.wiki 3.4: six trials worth 10,000 (two new: grow a tree in the chat, quote the post with your
-- fork card), the quote checked by its link, and referrals: +2,000 for every friend who signs in
-- through your link and finishes three trials.
-- Run after 0001_init.sql and 0002_scan.sql. Self-contained and safe to run more than once.

-- ---------------------------------------------------------------- trials
alter table public.tasks            add column if not exists verify text not null default 'timer'; -- timer | trees | link
alter table public.task_completions add column if not exists base   int;   -- trees: the account's tree count when it opened
alter table public.task_completions add column if not exists proof  text;  -- link: the status id that counted
create unique index if not exists task_completions_proof_idx on public.task_completions (proof) where proof is not null;

insert into tasks (id, type, reward, min_wait_sec, sort, verify) values
  ('chat',  'chat',  1000, 0, 5, 'trees'),
  ('quote', 'quote', 3000, 0, 6, 'link')
on conflict (id) do nothing;
-- the amounts, once, on the way up from schema 2: 10,000 over six trials (tune later with plain updates)
update tasks set reward = case id when 'follow' then 2000 when 'like' then 1000 when 'repost' then 1500
                                  when 'comment' then 1500 when 'chat' then 1000 when 'quote' then 3000 else reward end
where coalesce((select value from meta where key = 'schema'), '1') < '3';
update tasks set verify = 'trees', min_wait_sec = 0 where id = 'chat';
update tasks set verify = 'link',  min_wait_sec = 0 where id = 'quote';

-- ---------------------------------------------------------------- referrals
alter table public.profiles add column if not exists ref_code text;
create unique index if not exists profiles_ref_code_idx on public.profiles (ref_code);

create table if not exists public.referrals (
  referred_id  uuid primary key references public.profiles (id) on delete cascade, -- one referrer per account, ever
  referrer_id  uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  qualified_at timestamptz,                                                      -- when the friend finished enough trials
  check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
alter table public.referrals enable row level security;

-- the link is forks.wiki/r/<handle>; a taken handle gets a short suffix
create or replace function public.ensure_ref_code(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
  base text;
begin
  select ref_code, regexp_replace(lower(x_username), '[^a-z0-9_]', '', 'g') into code, base from profiles where id = p_user;
  if code is not null then return code; end if;
  code := coalesce(nullif(base, ''), 'fork');
  if exists (select 1 from profiles where ref_code = code) then
    code := code || '-' || substr(md5(p_user::text), 1, 6);
  end if;
  update profiles set ref_code = code where id = p_user;
  return code;
end $$;

-- give everyone who signed in before 3.4 a code
do $$ declare r record; begin
  for r in select id from profiles where ref_code is null order by created_at loop perform ensure_ref_code(r.id); end loop;
end $$;

-- the friend finished enough trials: the referrer's +2,000 lands, once (ledger key ref:<friend>)
create or replace function public.ref_qualify(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r referrals%rowtype;
  who text;
begin
  select * into r from referrals where referred_id = p_user and qualified_at is null for update;
  if not found then return; end if;
  if (select count(*) from task_completions where user_id = p_user and completed_at is not null) < cfg('ref.min_tasks', 3) then return; end if;
  if coalesce((select followers from profiles where id = p_user), 0) < cfg('ref.min_followers', 0) then return; end if;
  update referrals set qualified_at = now() where referred_id = p_user;
  select x_username into who from profiles where id = p_user;
  perform credit(r.referrer_id, cfg('ref.reward', 2000)::int, 'Referral: @' || who, 'ref:' || p_user);
end $$;

-- ---------------------------------------------------------------- sign-in, now with the referral
drop function if exists public.upsert_x_user(text, text, text, text, timestamptz, int, int, int, int, boolean, text);
create or replace function public.upsert_x_user(
  p_x_id text, p_username text, p_name text, p_avatar text,
  p_x_created_at timestamptz default null, p_followers int default null, p_following int default null,
  p_tweets int default null, p_listed int default null, p_verified boolean default false, p_verified_type text default null,
  p_ref text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  fresh boolean;
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
  returning id, (xmax = 0) into pid, fresh;
  perform ensure_ref_code(pid);

  -- a referral binds only to a brand-new account, never to yourself, and never twice
  if fresh and p_ref is not null then
    insert into referrals (referred_id, referrer_id)
    select pid, id from profiles where ref_code = lower(p_ref) and id <> pid
    on conflict (referred_id) do nothing;
  end if;

  -- the x scan, once per account (see 0002_scan.sql)
  if (select scan from profiles where id = pid) is null then
    s := scan_lines(p_x_created_at, p_followers, p_tweets, p_listed, coalesce(p_verified, false) or coalesce(p_verified_type, 'none') not in ('none', ''));
    if credit(pid, (s ->> 'total')::int, 'X scan', 'scan:' || pid) then
      update profiles set scan = s, scan_seen = false where id = pid;
    end if;
  end if;
  return pid;
end $$;

-- ---------------------------------------------------------------- open / claim with the new checks
create or replace function public.api_task_open(p_user uuid, p_task text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c task_completions%rowtype;
begin
  if not exists (select 1 from tasks where id = p_task and active) then
    return jsonb_build_object('ok', false, 'error', 'unknown_task');
  end if;
  insert into task_completions (user_id, task_id, opened_at, base)
  values (p_user, p_task, now(), (select traces from profiles where id = p_user))
  on conflict (user_id, task_id) do update set
    opened_at = coalesce(task_completions.opened_at, excluded.opened_at),
    base = coalesce(task_completions.base, excluded.base)
  returning * into c;
  return jsonb_build_object('ok', true, 'openedAt', c.opened_at, 'completedAt', c.completed_at, 'now', now());
end $$;

-- x.com/<handle>/status/<id> (or twitter.com, mobile., ?query): the handle must be yours, the post
-- newer than your forks account, and no post counts for two people. Its time comes from the id itself.
create or replace function public.quote_check(p_user uuid, p_url text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m text[];
  sid numeric;
  at timestamptz;
  p profiles%rowtype;
begin
  m := regexp_match(coalesce(p_url, ''), '^\s*(?:https?://)?(?:www\.|mobile\.)?(?:x|twitter)\.com/([A-Za-z0-9_]{1,15})/status(?:es)?/([0-9]{6,25})(?:[/?#].*)?\s*$');
  if m is null then return jsonb_build_object('ok', false, 'error', 'bad_link'); end if;
  select * into p from profiles where id = p_user;
  if lower(m[1]) <> p.x_username then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  sid := m[2]::numeric;
  at := to_timestamp((floor(sid / 4194304) + 1288834974657) / 1000.0); -- snowflake: ms since 2010-11-04 in the top bits
  if at < p.created_at - interval '10 minutes' then return jsonb_build_object('ok', false, 'error', 'too_old'); end if;
  if at > now() + interval '5 minutes' then return jsonb_build_object('ok', false, 'error', 'bad_link'); end if;
  return jsonb_build_object('ok', true, 'id', m[2]);
end $$;

drop function if exists public.api_task_claim(uuid, text);
create or replace function public.api_task_claim(p_user uuid, p_task text, p_proof text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tasks%rowtype;
  c task_completions%rowtype;
  q jsonb;
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

  if t.verify = 'link' then
    q := quote_check(p_user, p_proof);
    if not (q ->> 'ok')::boolean then return q; end if;
    if exists (select 1 from task_completions where proof = q ->> 'id') then
      return jsonb_build_object('ok', false, 'error', 'link_used');
    end if;
    insert into task_completions (user_id, task_id, opened_at, completed_at, proof) values (p_user, p_task, now(), now(), q ->> 'id')
    on conflict (user_id, task_id) do update set completed_at = now(), proof = excluded.proof;
  else
    if c.opened_at is null then return jsonb_build_object('ok', false, 'error', 'not_opened'); end if;
    if t.verify = 'trees' and (select traces from profiles where id = p_user) <= coalesce(c.base, 0) then
      return jsonb_build_object('ok', false, 'error', 'no_tree');
    end if;
    if now() - c.opened_at < make_interval(secs => t.min_wait_sec) then
      return jsonb_build_object('ok', false, 'error', 'too_early',
        'wait', extract(epoch from (c.opened_at + make_interval(secs => t.min_wait_sec) - now())));
    end if;
    update task_completions set completed_at = now() where user_id = p_user and task_id = p_task;
  end if;

  credited := credit(p_user, t.reward, 'Trial: ' || t.id, 'task:' || p_user || ':' || p_task);
  perform ref_qualify(p_user);
  select allocation into total from profiles where id = p_user;
  return jsonb_build_object('ok', true, 'reward', case when credited then t.reward else 0 end, 'allocation', total);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'link_used');
end $$;

-- ---------------------------------------------------------------- what the page sees
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
    'ref', jsonb_build_object(
      'code', p.ref_code,
      'reward', cfg('ref.reward', 2000)::int,
      'minTasks', cfg('ref.min_tasks', 3)::int,
      'invited', (select count(*) from referrals r where r.referrer_id = p.id),
      'counted', (select count(*) from referrals r where r.referrer_id = p.id and r.qualified_at is not null),
      'earned', (select coalesce(sum(amount), 0) from ledger l where l.user_id = p.id and l.idempotency_key like 'ref:%'),
      'by', (select q.x_username from referrals r join profiles q on q.id = r.referrer_id where r.referred_id = p.id)),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'type', t.type, 'reward', t.reward, 'waitSec', t.min_wait_sec, 'verify', t.verify,
        'openedAt', c.opened_at, 'completedAt', c.completed_at) order by t.sort), '[]'::jsonb)
      from tasks t left join task_completions c on c.task_id = t.id and c.user_id = p.id where t.active),
    'now', now()
  ) from profiles p where p.id = p_user
$$;

-- ---------------------------------------------------------------- lockdown, again
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

insert into meta (key, value) values ('schema', '3')
on conflict (key) do update set value = greatest(meta.value, excluded.value);
