-- due_pushes() 점검. Supabase SQL Editor에서 실행. 마지막에 일부러 에러를 내서 전부 되돌린다(아무것도 안 남음).
-- 결과는 에러 메시지로 나온다: "TEST a=0 b=1 c=0 d=0 e=0 f=1" 이면 정상.
do $$
declare uid uuid := (select id from auth.users limit 1); a int; b int; c int; d int; e int; f int;
begin
  insert into push_subs (user_id, endpoint, p256dh, auth) values (uid, 'https://example.invalid/t', 'k', 'a');
  insert into ai_usage (user_id, last_at) values (uid, kst_midnight() - interval '2 days')
    on conflict (user_id) do update set last_at = excluded.last_at;
  delete from messages where user_id = uid;
  select count(*) into a from due_pushes();                       -- 쓴 글 없음 → 0
  insert into messages (user_id, iv, data, ts) values (uid, 'x', 'y', floor(extract(epoch from kst_midnight()) * 1000) - 3600000);
  select count(*) into b from due_pushes();                       -- 어젯밤 11시 글 → 1
  select count(*) into c from due_pushes();                       -- 오늘 이미 보냄 → 0
  update push_subs set mode = 'off', last_push = null where user_id = uid;
  select count(*) into d from due_pushes();                       -- 끔 → 0
  update push_subs set mode = 'week' where user_id = uid;
  select count(*) into e from due_pushes();                       -- 매주, 마지막 한마디 2일 전 → 0
  update ai_usage set last_at = kst_midnight() - interval '7 days' where user_id = uid;
  select count(*) into f from due_pushes();                       -- 매주, 7일 전 → 1
  raise exception 'TEST a=% b=% c=% d=% e=% f=% (expect 0 1 0 0 0 1)', a, b, c, d, e, f;
end $$;
