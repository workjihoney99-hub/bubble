-- Supabase SQL Editor에 붙여넣고 Run.
-- 서버는 암호문(iv, data)만 본다. 평문은 폰에만.

create table profiles (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  salt       text not null,   -- KDF 버전 표시('v1'). 실제 salt는 닉네임에서 파생되므로 서버에 없음
  iv         text not null,   -- 프로필(이름/날짜/사진) 암호문
  data       text not null,
  created_at timestamptz not null default now()
);

create table messages (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  iv      text not null,
  data    text not null,      -- {t} 또는 {img} 암호문. ponytail: 사진도 여기. 커지면 Storage로.
  ts      bigint not null     -- 보낸 시각(ms). 표시용이라 평문.
);
create index messages_user_id_idx on messages (user_id, id);

alter table profiles enable row level security;
alter table messages enable row level security;

create policy "own profile"  on profiles for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own messages" on messages for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 한마디(AI): 한국 날짜로 하루 한 번 ──
-- 정책 없음 = 사용자가 직접 못 건드림. 아래 함수만 쓴다.
create table ai_usage (
  user_id uuid primary key references auth.users on delete cascade,
  last_at timestamptz not null
);
alter table ai_usage enable row level security;

-- 오늘 0시(한국 시간)
create function kst_midnight() returns timestamptz language sql stable
as $$ select date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' $$;

-- 오늘 이미 받았으면 null, 아니면 기록하고 그 시각을 돌려준다.
-- 앱은 이 시각을 한마디의 ts로 쓴다 → due_pushes()가 "한마디 뒤에 쓴 글"을 정확히 셀 수 있다.
-- 확인과 기록이 한 문장이라 동시 호출에도 하나만 통과.
create function claim_ai_slot() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  insert into ai_usage (user_id, last_at) values (auth.uid(), now())
  on conflict (user_id) do update set last_at = now()
    where ai_usage.last_at < kst_midnight()
  returning last_at into t;
  return t;
end $$;
revoke all on function claim_ai_slot() from public, anon;
grant execute on function claim_ai_slot() to authenticated;

-- ── 밤 12시 푸시 알림 ──
-- 브라우저가 준 푸시 주소와 암호화 키. mode(매일/매주/끔)는 서버가 보낼 사람을 골라야 해서 평문.
create table push_subs (
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint  text not null,
  p256dh    text not null,
  auth      text not null,
  mode      text not null default 'day',
  last_push timestamptz,
  primary key (user_id, endpoint)
);
alter table push_subs enable row level security;
create policy "own subs" on push_subs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 지금 알림 받을 기기. 보낸 걸로 표시까지 한 번에. 규칙은 앱의 due.js와 같다:
-- 오늘 아직 한마디/알림이 없고, 마지막 한마디 뒤 ~ 오늘 0시 전에 쓴 글이 있을 때.
-- 몇 번 불려도 하루 한 번만 내주므로 push 함수는 인증 없이 열어둔다.
create function due_pushes() returns table (endpoint text, p256dh text, auth text)
language sql security definer set search_path = public as $$
  with due as (
    select s.user_id, s.endpoint from push_subs s left join ai_usage u using (user_id)
    where s.mode <> 'off'
      and (s.last_push is null or s.last_push < kst_midnight())
      and coalesce(u.last_at, '-infinity') < kst_midnight() - case s.mode when 'week' then interval '6 days' else interval '0' end
      and exists (select 1 from messages m where m.user_id = s.user_id
        and m.ts > coalesce(floor(extract(epoch from u.last_at) * 1000), 0)
        and m.ts < extract(epoch from kst_midnight()) * 1000)
  )
  update push_subs s set last_push = now() from due
  where s.user_id = due.user_id and s.endpoint = due.endpoint
  returning s.endpoint, s.p256dh, s.auth;
$$;
revoke all on function due_pushes() from public, anon, authenticated;
grant execute on function due_pushes() to service_role;

-- 밤 12시(한국) = 15:00 UTC 에 push 함수 호출
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('bubble-midnight-push', '0 15 * * *', $$
  select net.http_post(url := 'https://jjyvmsbizpevcinmflfd.supabase.co/functions/v1/push',
                       body := '{}'::jsonb, timeout_milliseconds := 60000)
$$);
