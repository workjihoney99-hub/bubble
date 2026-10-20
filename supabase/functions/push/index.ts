// 밤 12시(한국) pg_cron이 부른다 → due_pushes()가 고른 기기에 Web Push를 보낸다.
// 앱에서 "알림 켜기" 직후 {endpoint}로 부르면 그 기기에만 확인 알림을 한 번 보낸다.
// 누가 몇 번 불러도 due_pushes()가 하루 한 번만 내주므로 인증은 없다. Verify JWT 끔.
// 비밀값: VAPID_PRIVATE_KEY (대시보드 Edge Functions > Secrets). 공개키는 index.html과 같아야 함.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const SB_URL = "https://jjyvmsbizpevcinmflfd.supabase.co";
const VAPID_PUBLIC = "BNYLKnhFnYj5th1IvvfX60EVdH-qgm65JkPssL8shUhgRLqFagMcufsrLZKz9jR7XozA_OLKWy-q55uHlSeTTL0";
const SITE = "https://workjihoney99-hub.github.io/bubble/";
const MSG = {
  night: { title: "한마디가 왔어요", body: "쓴 메시지를 읽고 한마디 남겼어요." },
  test: { title: "알림이 켜졌어요", body: "밤 12시에 한마디가 오면 알려줄게요." },
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// <webpush> RFC 8291 aes128gcm 암호화. test.js가 이 블록을 꺼내 RFC 예제값으로 검증한다(그래서 순수 JS).
const te = new TextEncoder();
const b64u = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits(
  { name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), len * 8));

async function wpKeys(ua, auth, as, asPrivate, salt) {
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));
  const ikm = await hkdf(auth, shared, cat(te.encode("WebPush: info\0"), ua, as), 32);
  return {
    cek: await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16),
    nonce: await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12),
  };
}
async function wpEncrypt(text, p256dh, auth, eph = null, salt = crypto.getRandomValues(new Uint8Array(16))) {
  eph = eph || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const { cek, nonce } = await wpKeys(unb64u(p256dh), unb64u(auth), as, eph.privateKey, salt);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(te.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([as.length]), as, ct); // rs=4096, 레코드 하나
}
// </webpush>

// VAPID: 이 서버가 보낸 푸시임을 증명하는 ES256 JWT
async function vapidHeader(endpoint: string, key: CryptoKey) {
  const part = (o: unknown) => b64u(te.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${VAPID_PUBLIC}`;
}
type Sub = { endpoint: string; p256dh: string; auth: string };
async function send(s: Sub, msg: object, key: CryptoKey) {
  try {
    const r = await fetch(s.endpoint, {
      method: "POST",
      headers: { Authorization: await vapidHeader(s.endpoint, key), TTL: "43200", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream" },
      body: await wpEncrypt(JSON.stringify(msg), s.p256dh, s.auth),
    });
    return r.status;
  } catch { return 0; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let key: CryptoKey;
  try {
    const pub = unb64u(VAPID_PUBLIC);
    key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33)), d: Deno.env.get("VAPID_PRIVATE_KEY") },
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  } catch { return json({ error: "no_vapid_key" }, 500); }

  // 구독 목록은 RLS를 넘어 봐야 해서 서버 전용 키로
  const secret = Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"))[0] as string | undefined;
  const sb = createClient(SB_URL, secret ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const b = await req.json().catch(() => ({}));
  if (typeof b.endpoint === "string") { // 확인 알림: 등록된 기기만 (주소는 그 기기만 앎)
    const { data } = await sb.from("push_subs").select("endpoint,p256dh,auth").eq("endpoint", b.endpoint).limit(1);
    if (!data?.length) return json({ error: "unknown" }, 404);
    return json({ status: await send(data[0], MSG.test, key) });
  }

  const { data: due, error } = await sb.rpc("due_pushes");
  if (error) return json({ error: error.message }, 500);
  const res = await Promise.all((due as Sub[]).map((s) => send(s, MSG.night, key)));
  const gone = (due as Sub[]).filter((_, i) => res[i] === 404 || res[i] === 410).map((s) => s.endpoint);
  if (gone.length) await sb.from("push_subs").delete().in("endpoint", gone); // 앱 지운 기기
  return json({ due: due.length, sent: res.filter((s) => s >= 200 && s < 300).length, gone: gone.length, failed: res.filter((s) => s === 0 || s >= 400).length });
});
