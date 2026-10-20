// E2EE 헬퍼. 브라우저(classic script)와 Node(vm.runInThisContext) 양쪽에서 그대로 돎.
// 서버는 닉네임 해시 + 로그인용 절반만 본다. 암호화 키는 기기 밖으로 안 나간다.
const b64=b=>{let s='';for(const c of new Uint8Array(b))s+=String.fromCharCode(c);return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const utf8=s=>new TextEncoder().encode(s);

// 닉네임+암호 → PBKDF2 64바이트. 앞 32B = 로그인 비밀번호(서버로 감), 뒤 32B = AES 키(기기에만).
// 같은 KDF의 다른 블록이라 앞쪽을 알아도 뒤쪽은 못 만든다.
async function derive(pass,nick){
 const salt=utf8('bubble:'+nick.trim().normalize('NFC').toLowerCase());
 const base=await crypto.subtle.importKey('raw',utf8(pass),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},base,512);
 const id=hex(await crypto.subtle.digest('SHA-256',salt));
 return {
  email:id.slice(0,32)+'@bubble.invalid',   // Supabase Auth용 가짜 주소. 메일은 절대 안 보냄.
  password:hex(bits.slice(0,32)),
  key:await crypto.subtle.importKey('raw',bits.slice(32),'AES-GCM',true,['encrypt','decrypt']),
 };
}
async function enc(key,obj){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,utf8(JSON.stringify(obj)));
 return {iv:b64(iv),data:b64(ct)};
}
async function dec(key,m){
 const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(m.iv)},key,unb64(m.data));
 return JSON.parse(new TextDecoder().decode(pt));
}
