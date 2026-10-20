// node test.js — crypto.js, due.js 자가 점검
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert');
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'crypto.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'due.js'),'utf8'));

// 한마디 시점: 로컬 시각 기준 (2026-10-20 = 화)
const T=(d,h,m=0)=>new Date(2026,9,d,h,m).getTime(), msg=ts=>({t:'x',ts}), ai=ts=>({ai:'y',ts});
assert.strictEqual(aiDue([msg(T(20,9))],'day',T(20,23,59)),0,'오늘 쓴 건 오늘 밤 12시까진 안 옴');
assert.strictEqual(aiDue([msg(T(20,9))],'day',T(21,0)),1,'밤 12시 정각에 옴');
assert.strictEqual(aiDue([msg(T(20,9)),msg(T(20,10))],'day',T(21,8)),2,'아침에 열면 그때 옴');
assert.strictEqual(aiDue([msg(T(20,9)),ai(T(21,0)),msg(T(21,0,30))],'day',T(21,20)),0,'오늘 이미 받음');
assert.strictEqual(aiDue([msg(T(20,9)),ai(T(21,0)),msg(T(21,0,30))],'day',T(22,0)),1,'다음 날 밤 12시');
assert.strictEqual(aiDue([msg(T(19,9)),ai(T(19,23,50))],'day',T(20,0)),0,'안 읽은 게 없으면 안 옴');
assert.strictEqual(aiDue([ai(T(19,23,50)),msg(T(19,23,55))],'day',T(20,0)),1,'늦게 받은 한마디 직후에 쓴 것도 다음 자정에');
assert.strictEqual(aiDue([ai(T(13,0)),msg(T(14,9))],'week',T(19,0)),0,'매주: 6일째는 아직');
assert.strictEqual(aiDue([ai(T(13,0)),msg(T(14,9))],'week',T(20,0)),1,'매주: 7일째 밤 12시');
assert.strictEqual(aiDue([msg(T(20,9))],'off',T(21,1)),0,'끔');

(async()=>{
 const a=await derive('correct horse','지훈'), a2=await derive('correct horse',' 지훈 '), b=await derive('wrong horse','지훈'), c=await derive('correct horse','민수');
 assert.strictEqual(a.email,a2.email,'닉네임 공백/대소문자는 같은 계정이어야');
 assert.strictEqual(a.password,a2.password);
 assert.notStrictEqual(a.password,b.password,'암호 다르면 로그인키 달라야');
 assert.notStrictEqual(a.email,c.email,'닉네임 다르면 계정 달라야');
 assert.ok(!a.email.includes('지훈')&&a.password.length===64,'서버엔 해시만');

 const m=await enc(a.key,{t:'오늘 출근길에 그 카페 지나갔어'});
 assert.ok(!m.data.includes('카페'),'암호문에 평문이 보임');
 assert.deepStrictEqual(await dec(a.key,m),{t:'오늘 출근길에 그 카페 지나갔어'});
 assert.deepStrictEqual(await dec(a2.key,m),{t:'오늘 출근길에 그 카페 지나갔어'},'같은 입력이면 같은 키');
 await assert.rejects(dec(b.key,m),'다른 암호 키로 복호화되면 안 됨');
 assert.notStrictEqual(hex(await crypto.subtle.exportKey('raw',a.key)),a.password,'로그인키와 암호화키가 같으면 안 됨');

 const big='x'.repeat(300000);                       // 640px 사진 dataURL보다 큼
 assert.strictEqual((await dec(a.key,await enc(a.key,{img:big}))).img,big);

 const raw=await crypto.subtle.exportKey('raw',a.key);  // 기기에 저장되는 형태
 const k3=await crypto.subtle.importKey('raw',unb64(b64(raw)),'AES-GCM',false,['decrypt']);
 assert.deepStrictEqual(await dec(k3,m),{t:'오늘 출근길에 그 카페 지나갔어'});

 // 푸시 암호화: push 함수의 <webpush> 블록을 RFC 8291 부록 A 예제값으로 검증
 const src=fs.readFileSync(path.join(__dirname,'supabase/functions/push/index.ts'),'utf8');
 vm.runInThisContext(src.slice(src.indexOf('// <webpush>'),src.indexOf('// </webpush>')));
 const R={asPub:'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',asPriv:'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPriv:'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',salt:'DGv6ra1nlYgDCS1FRnbzlw',auth:'BTBZMqHH6r4Tts7J_aSIgg',cek:'oIhVW04MRdy2XN9CiKLxTg',nonce:'4h_95klXJ5E_qnoN'};
 const ecdh=require('crypto').createECDH('prime256v1');ecdh.setPrivateKey(Buffer.from(R.uaPriv,'base64url'));
 const uaPub=b64u(ecdh.getPublicKey()), asRaw=unb64u(R.asPub);
 const eph={publicKey:await crypto.subtle.importKey('raw',asRaw,{name:'ECDH',namedCurve:'P-256'},true,[]),
  privateKey:await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:b64u(asRaw.slice(1,33)),y:b64u(asRaw.slice(33)),d:R.asPriv},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits'])};
 const k=await wpKeys(unb64u(uaPub),unb64u(R.auth),asRaw,eph.privateKey,unb64u(R.salt));
 assert.strictEqual(b64u(k.cek),R.cek,'RFC 8291 CEK');
 assert.strictEqual(b64u(k.nonce),R.nonce,'RFC 8291 NONCE');
 const text='When I grow up, I want to be a watermelon', body=await wpEncrypt(text,uaPub,R.auth,eph,unb64u(R.salt));
 assert.strictEqual(b64u(body.slice(0,21)),R.salt+'AAEABB','헤더: salt, rs=4096, idlen=65');
 assert.strictEqual(b64u(body.slice(21,86)),R.asPub,'헤더: 서버 공개키');
 const pt=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:k.nonce},await crypto.subtle.importKey('raw',k.cek,'AES-GCM',false,['decrypt']),body.slice(86)));
 assert.strictEqual(new TextDecoder().decode(pt),text+'\x02','본문 + 마지막 레코드 표시');

 console.log('ok');
})();
