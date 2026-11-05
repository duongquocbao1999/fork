-- forks.wiki 4.1: connect GitHub, an optional trial. One GitHub account per X account, for good; the bonus
-- (+3,000 by default, tasks.reward) lands once, in the GitHub callback on the server — never from the page.
-- Optional trials sit beside the six: they don't count toward "all trials done" or toward a referral.
-- Run after 0004_launch.sql. Self-contained and safe to run more than once.

-- ---------------------------------------------------------------- who is on GitHub
alter table public.profiles add column if not exists github_id         bigint;
alter table public.profiles add column if not exists github_login      text;
alter table public.profiles add column if not exists github_created_at timestamptz;
alter table public.profiles add column if not exists github_repos      int;
alter table public.profiles add column if not exists github_followers  int;
alter table public.profiles add column if not exists github_linked_at  timestamptz;
create unique index if not exists profiles_github_id_idx on public.profiles (github_id) where github_id is not null;

-- ---------------------------------------------------------------- the trial
alter table public.tasks add column if not exists optional boolean not null default false;
insert into tasks (id, type, reward, min_wait_sec, sort, verify, optional) values ('github', 'github', 3000, 0, 7, 'github', true)
on conflict (id) do nothing;
update tasks set optional = true, verify = 'github', min_wait_sec = 0 where id = 'github';

-- a GitHub account younger than this doesn't get the bonus (fresh accounts are the cheapest to farm)
insert into app_config (key, value, note) values ('github.min_age_days', 30, 'GitHub account age (days) for the connect bonus')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- the callback's one call
-- p_user comes from the session cookie, the rest from GitHub's own /user answer, read on the server.
create or replace function public.api_github_link(p_user uuid, p_gh_id bigint, p_login text, p_created timestamptz,
  p_repos int default null, p_followers int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  t tasks%rowtype;
  credited boolean := false;
  total bigint;
begin
  if p_gh_id is null or coalesce(p_login, '') = '' then return jsonb_build_object('ok', false, 'error', 'profile'); end if;
  select * into p from profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if p.github_id is not null and p.github_id <> p_gh_id then
    return jsonb_build_object('ok', false, 'error', 'linked_other', 'login', p.github_login);
  end if;
  if exists (select 1 from profiles where github_id = p_gh_id and id <> p_user) then
    return jsonb_build_object('ok', false, 'error', 'github_taken');
  end if;
  if p_created is not null and p_created > now() - make_interval(days => cfg('github.min_age_days', 30)::int) then
    return jsonb_build_object('ok', false, 'error', 'too_new');
  end if;

  update profiles set github_id = p_gh_id, github_login = p_login, github_created_at = p_created,
    github_repos = p_repos, github_followers = p_followers, github_linked_at = coalesce(github_linked_at, now())
  where id = p_user;

  select * into t from tasks where id = 'github' and active;
  if found then
    insert into task_completions (user_id, task_id, opened_at, completed_at) values (p_user, 'github', now(), now())
    on conflict (user_id, task_id) do update set completed_at = coalesce(task_completions.completed_at, now());
    credited := credit(p_user, t.reward, 'Trial: github', 'task:' || p_user || ':github');
  end if;
  select allocation into total from profiles where id = p_user;
  return jsonb_build_object('ok', true, 'login', p_login, 'reward', case when credited then t.reward else 0 end, 'allocation', total);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'github_taken');
end $$;

-- ---------------------------------------------------------------- the github trial can't be opened or claimed from the page
create or replace function public.api_task_open(p_user uuid, p_task text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c task_completions%rowtype;
begin
  if not exists (select 1 from tasks where id = p_task and active) then
    return jsonb_build_object('ok', false, 'error', 'unknown_task');
  end if;
  if (select verify from tasks where id = p_task) = 'github' then return jsonb_build_object('ok', false, 'error', 'use_github'); end if;
  insert into task_completions (user_id, task_id, opened_at, base)
  values (p_user, p_task, now(), (select traces from profiles where id = p_user))
  on conflict (user_id, task_id) do update set
    opened_at = coalesce(task_completions.opened_at, excluded.opened_at),
    base = coalesce(task_completions.base, excluded.base)
  returning * into c;
  return jsonb_build_object('ok', true, 'openedAt', c.opened_at, 'completedAt', c.completed_at, 'now', now());
end $$;

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
  if t.verify = 'github' then return jsonb_build_object('ok', false, 'error', 'use_github'); end if;
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

-- a referral counts the six trials only, not the optional ones
create or replace function public.ref_qualify(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r referrals%rowtype;
  who text;
begin
  select * into r from referrals where referred_id = p_user and qualified_at is null for update;
  if not found then return; end if;
  if (select count(*) from task_completions c join tasks t on t.id = c.task_id
      where c.user_id = p_user and c.completed_at is not null and not t.optional) < cfg('ref.min_tasks', 3) then return; end if;
  if coalesce((select followers from profiles where id = p_user), 0) < cfg('ref.min_followers', 0) then return; end if;
  update referrals set qualified_at = now() where referred_id = p_user;
  select x_username into who from profiles where id = p_user;
  perform credit(r.referrer_id, cfg('ref.reward', 2000)::int, 'Referral: @' || who, 'ref:' || p_user);
end $$;

-- ---------------------------------------------------------------- what the page sees: + optional, + github
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
    'github', case when p.github_id is null then null else jsonb_build_object('login', p.github_login, 'linkedAt', p.github_linked_at) end,
    'ref', jsonb_build_object(
      'code', p.ref_code,
      'reward', cfg('ref.reward', 2000)::int,
      'minTasks', cfg('ref.min_tasks', 3)::int,
      'invited', (select count(*) from referrals r where r.referrer_id = p.id),
      'counted', (select count(*) from referrals r where r.referrer_id = p.id and r.qualified_at is not null),
      'earned', (select coalesce(sum(amount), 0) from ledger l where l.user_id = p.id and l.idempotency_key like 'ref:%'),
      'by', (select q.x_username from referrals r join profiles q on q.id = r.referrer_id where r.referred_id = p.id)),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'type', t.type, 'reward', t.reward, 'waitSec', t.min_wait_sec, 'verify', t.verify, 'optional', t.optional,
        'openedAt', c.opened_at, 'completedAt', c.completed_at) order by t.sort), '[]'::jsonb)
      from tasks t left join task_completions c on c.task_id = t.id and c.user_id = p.id where t.active),
    'now', now()
  ) from profiles p where p.id = p_user
$$;

-- ---------------------------------------------------------------- lockdown, again
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

insert into meta (key, value) values ('schema', '5')
on conflict (key) do update set value = greatest(meta.value, excluded.value);
