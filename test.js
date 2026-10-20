// node test.js — crypto.js, due.js 자가 점검
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert');
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'crypto.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'due.js'),'utf8'));

// 한마디 시점: 로컬 시각 기준 (2026-10-20 = 화)
const T=(d,h,m=0)=>new Date(2026,9,d,h,m).getTime(), msg=ts=>({t:'x',ts}), ai=ts=>({ai:'y',ts});
assert.strictEqual(aiDue([msg(T(20,9))],'day',T(20,11,59)),0,'12시 전엔 안 옴');
assert.strictEqual(aiDue([msg(T(20,9))],'day',T(20,12)),1,'12시 정각에 옴');
assert.strictEqual(aiDue([msg(T(20,9)),msg(T(20,10))],'day',T(20,18)),2,'12시 넘어 열면 그때 옴');
assert.strictEqual(aiDue([msg(T(20,12,30))],'day',T(20,15)),0,'12시 뒤에 쓴 건 다음 날 12시에');
assert.strictEqual(aiDue([msg(T(20,9)),ai(T(20,12)),msg(T(20,13))],'day',T(20,20)),0,'오늘 이미 받음');
assert.strictEqual(aiDue([msg(T(20,9)),ai(T(20,12)),msg(T(20,13))],'day',T(21,12)),1,'다음 날 12시');
assert.strictEqual(aiDue([msg(T(19,9)),ai(T(19,23,50))],'day',T(20,12)),0,'안 읽은 게 없으면 안 옴');
assert.strictEqual(aiDue([ai(T(13,12)),msg(T(14,9))],'week',T(19,12)),0,'매주: 6일째는 아직');
assert.strictEqual(aiDue([ai(T(13,12)),msg(T(14,9))],'week',T(20,12)),1,'매주: 7일째 12시');
assert.strictEqual(aiDue([msg(T(20,9))],'off',T(20,13)),0,'끔');

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

 console.log('ok');
})();
