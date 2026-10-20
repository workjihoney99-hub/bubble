// 앱을 열 때 부르는 "한마디". 메시지 내용은 받지 않는다(E2EE 유지).
// 배포: Supabase 대시보드 Edge Functions에 이 파일을 그대로. Verify JWT는 끔(아래 RPC가 대신 확인).
// 비밀값: bubble_ai_key = Claude API 키 (대시보드 Edge Functions > Secrets)
import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const SB_URL = "https://jjyvmsbizpevcinmflfd.supabase.co";
const SB_KEY = "sb_publishable__ouR0LZd8tV11czxkxCOwA_MZCpefkz"; // 공개 키
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const SYSTEM = `너는 이별한 사람이 헤어진 연인에게 부치지 못할 메시지를 쓰는 앱 안에서, 가끔 짧은 한마디를 건네는 다정한 친구야.
- 헤어진 연인인 척하지 마. 그 사람 대신 답하거나 그 사람 마음을 짐작해서 말하지 마.
- 다시 연락하라거나 재회를 기대하게 하는 말은 하지 마.
- 메시지 내용은 너에게 보이지 않아. 헤어진 지 며칠째인지, 요일, 시각, 메시지를 몇 개 썼는지만 알아. 내용을 아는 척하지 마.
- 새벽이거나 메시지가 많았으면, 잠과 몸을 챙기라고 부드럽게 말해.
- 해요체로 1~2문장. 이모지, 따옴표, 머리말 없이 문장만.`;

const int = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // 사용자 토큰으로 호출 → 로그인 안 했거나 11시간 안 지났으면 여기서 끝. Claude 비용은 이 뒤에서만 나감.
  // ponytail: Claude 호출이 실패해도 그날 몫은 써버림. 실패가 잦아지면 되돌리는 RPC 추가.
  const sb = createClient(SB_URL, SB_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: ok, error } = await sb.rpc("claim_ai_slot");
  if (error) return json({ error: "auth" }, 401);
  if (!ok) return json({ error: "too_soon" }, 429);

  // 클라이언트 값은 숫자로만 받는다 (프롬프트에 임의 문자열이 못 들어가게)
  const b = await req.json().catch(() => ({}));
  const day = b.day == null ? "헤어진 날은 몰라요" : `헤어진 지 ${int(b.day, 36500)}일째`;
  const facts = `${day}. ${WEEK[int(b.weekday, 6)]}요일 ${int(b.hour, 23)}시. 지난 한마디 이후 쓴 메시지 ${int(b.count, 999)}개.`;

  try {
    const msg = await new Anthropic({ apiKey: Deno.env.get("bubble_ai_key") }).beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: facts }],
    });
    if (msg.stop_reason === "refusal") return json({ error: "refusal" }, 502);
    const text = msg.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("").trim();
    return text ? json({ text }) : json({ error: "empty" }, 502);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "bad_key" }, 500);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: `claude_${e.status}` }, 502);
    return json({ error: "no_key_or_network" }, 500);
  }
});
