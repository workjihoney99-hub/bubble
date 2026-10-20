// 한마디가 지금 올 때인지. 매일(매주면 7일마다) 낮 12시, 12시 전에 쓴 안 읽은 메시지가 있을 때.
// 반환: AI에게 알려줄 메시지 개수. 0이면 아직 아님. 브라우저와 node test.js 양쪽에서 돎.
function aiDue(plain, mode, now = Date.now()) {
 if (mode === 'off') return 0;
 const noon = new Date(now); noon.setHours(12, 0, 0, 0);
 if (now < noon) return 0;
 const from = new Date(noon); from.setDate(from.getDate() - (mode === 'week' ? 6 : 0)); // 이 뒤에 한마디가 있으면 이미 받은 것
 const last = plain.findLastIndex(m => m.ai);
 if (last >= 0 && plain[last].ts >= from) return 0;
 return plain.slice(last + 1).filter(m => m.ts < noon).length;
}
