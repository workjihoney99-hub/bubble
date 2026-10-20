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

-- ── 한마디(AI) 하루 1회 제한 ──
-- 정책 없음 = 사용자가 직접 못 건드림. 아래 함수만 쓴다.
create table ai_usage (
  user_id uuid primary key references auth.users on delete cascade,
  last_at timestamptz not null
);
alter table ai_usage enable row level security;

-- 20시간 안 지났으면 false. 확인과 기록을 한 문장으로 해서 동시 호출에도 한 번만 통과.
create function claim_ai_slot() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into ai_usage (user_id, last_at) values (auth.uid(), now())
  on conflict (user_id) do update set last_at = now()
    where ai_usage.last_at < now() - interval '20 hours';
  return found;
end $$;
revoke all on function claim_ai_slot() from public, anon;
grant execute on function claim_ai_slot() to authenticated;
