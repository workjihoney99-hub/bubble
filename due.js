// 한마디가 지금 올 때인지. 매일(매주면 7일마다) 밤 12시, 그 전에 쓴 안 읽은 메시지가 있을 때.
// 반환: AI에게 알려줄 메시지 개수. 0이면 아직 아님. 브라우저와 node test.js 양쪽에서 돎.
// 서버의 due_pushes()(schema.sql)도 같은 규칙으로 밤 12시 알림을 보낸다. 바꾸면 둘 다.
function aiDue(plain, mode, now = Date.now()) {
 if (mode === 'off') return 0;
 const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
 const from = new Date(midnight); from.setDate(from.getDate() - (mode === 'week' ? 6 : 0)); // 이 뒤에 한마디가 있으면 이미 받은 것
 const last = plain.findLastIndex(m => m.ai);
 if (last >= 0 && plain[last].ts >= from) return 0;
 return plain.slice(last + 1).filter(m => m.ts < midnight).length;
}
