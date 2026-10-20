// node test.js — crypto.js 자가 점검
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert');
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'crypto.js'),'utf8'));

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
