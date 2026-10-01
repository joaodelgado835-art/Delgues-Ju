import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../src/server.mjs';
import {quote,validDate,services,addons,policy} from '../src/catalog.mjs';
const work=resolve('..','..','work','tests');mkdirSync(work,{recursive:true});
async function fixture(t){let clock=Date.parse('2026-09-30T08:00:00-03:00');const dataDir=mkdtempSync(resolve(work,'atelier-'));const app=createApp({dataDir,adminToken:'test-only-secret',now:()=>clock});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;t.after(()=>app.close());
 const call=async(path,options={})=>{const r=await fetch(base+path,options);const d=await r.json();return {status:r.status,data:d};};
 const book=(overrides={})=>call('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service:'fibra',day:'2026-10-01',time:'09:00',name:'Cliente de Teste',phone:'84999999999',email:'',consent:true,...overrides})});
 const admin=(id,action,received)=>call('/api/admin',{method:'POST',headers:{Authorization:'Bearer test-only-secret','Content-Type':'application/json'},body:JSON.stringify({id,action,received})});
 const own=b=>({'x-booking-token':b.token});
 return {app,call,book,admin,own,dataDir,advance:n=>clock+=n};
}
test('catálogo reproduz os 17 preços, contato e Pix distintos',()=>{
 assert.deepEqual(services.map(s=>s.price),[15000,12000,11000,10000,12000,10000,8000,700,7000,10000,3000,3000]);
 assert.deepEqual(addons.map(a=>a.price),[3000,4000,6000,7000,8000]);
 assert.equal(policy.pixKey,'84981870533');assert.equal(policy.contactPhone,'84999021993');
 assert.equal(quote('fibra','art-5').price,23000);assert.equal(quote('reposicao','',3).price,2100);
 assert.throws(()=>quote('pedicure-russa','art-1'));assert.throws(()=>quote('reposicao','',11));
});
test('datas: limite de 10 dias, domingo fechado, duração e antecedência',()=>{
 const now=Date.parse('2026-09-30T08:00:00-03:00');assert.equal(validDate('2026-10-10','09:00',60,now),true);assert.equal(validDate('2026-10-12','09:00',60,now),false);assert.equal(validDate('2026-10-04','09:00',60,now),false);assert.equal(validDate('2026-10-01','17:00',120,now),false);assert.equal(validDate('2026-09-30','09:00',60,now),false);assert.equal(validDate('2026-02-30','09:00',60,now),false);
});
test('valor calculado no servidor, sem cadastro, com adicional e 50% de sinal',async t=>{
 const f=await fixture(t);const r=await f.book({addon:'art-5',total:1,deposit:1});assert.equal(r.status,201);assert.equal(r.data.total,23000);assert.equal(r.data.deposit,11500);
 const b=await f.call('/api/bookings/'+r.data.id,{headers:f.own(r.data)});assert.equal(b.data.status,'pending');assert.equal(b.data.pix,'84981870533');assert.equal(b.data.service_name,'Fibras de Vidro + Nail art nível V');assert.equal(b.data.token_hash,undefined);
});
test('concorrência e sobreposição: somente uma reserva ocupa os intervalos',async t=>{
 const f=await fixture(t);const responses=await Promise.all([f.book(),f.book()]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);const overlap=await f.book({service:'pedicure-tradicional',time:'10:00'});assert.equal(overlap.status,409);assert.equal(f.app.db.prepare('SELECT count(*) n FROM bookings').get().n,1);
 const a=await f.call('/api/availability?service=pedicure-tradicional&day=2026-10-01');assert.ok(!a.data.times.includes('10:00'));assert.ok(a.data.times.includes('12:00'));
});
test('privacidade: reserva e painel exigem segredo; arquivos privados não são servidos',async t=>{
 const f=await fixture(t);const b=(await f.book()).data;assert.equal((await f.call('/api/bookings/'+b.id)).status,404);assert.equal((await f.call('/api/admin')).status,401);assert.equal((await f.call('/data/admin-token.txt')).status,404);assert.equal((await f.call('/data/atelier.sqlite')).status,404);
 const x=await f.call('/api/bookings',{method:'POST',headers:{Origin:'https://outro.example','Content-Type':'application/json'},body:'{}'});assert.equal(x.status,403);
});
test('comprovante nunca confirma sozinho; exige conferência da profissional',async t=>{
 const f=await fixture(t),b=(await f.book()).data;assert.equal((await f.admin(b.id,'confirm',true)).status,409);
 const bad=await f.call('/api/bookings/'+b.id+'/receipt',{method:'POST',headers:f.own(b),body:'<script>alert(1)</script>'});assert.equal(bad.status,400);
 const image=readFileSync('public/images/french.png');const receipt=await f.call('/api/bookings/'+b.id+'/receipt',{method:'POST',headers:f.own(b),body:image});assert.equal(receipt.status,200);assert.equal(receipt.data.status,'review');assert.equal((await f.admin(b.id,'confirm',false)).status,409);assert.equal((await f.admin(b.id,'confirm',true)).status,200);assert.equal((await f.admin(b.id,'complete')).status,409);
 assert.equal((await f.call('/api/bookings/'+b.id,{headers:f.own(b)})).data.status,'confirmed');
});
test('expiração libera horário e impede envio tardio',async t=>{
 const f=await fixture(t),b=(await f.book()).data;f.advance(31*60000);const r=await f.call('/api/bookings/'+b.id,{headers:f.own(b)});assert.equal(r.data.status,'expired');assert.equal(r.data.pix,null);assert.equal((await f.book()).status,201);assert.equal((await f.call('/api/bookings/'+b.id+'/receipt',{method:'POST',headers:f.own(b),body:'x'})).status,409);
});
test('cancelamento libera horário e quantidade determina valor',async t=>{
 const f=await fixture(t),b=(await f.book({service:'reposicao',quantity:3})).data;assert.equal(b.total,2100);assert.equal(b.deposit,1050);assert.equal((await f.call('/api/bookings/'+b.id,{method:'DELETE',headers:f.own(b)})).status,200);assert.equal((await f.book()).status,201);
});
test('avaliação só após atendimento, única e com publicação moderada',async t=>{
 const f=await fixture(t),b=(await f.book()).data;
 const review=()=>f.call('/api/reviews',{method:'POST',headers:{...f.own(b),'Content-Type':'application/json'},body:JSON.stringify({booking:b.id,rating:2,body:'Gostaria de um acabamento melhor.',consent:true})});
 assert.equal((await review()).status,403);await f.call('/api/bookings/'+b.id+'/receipt',{method:'POST',headers:f.own(b),body:readFileSync('public/images/french.png')});await f.admin(b.id,'confirm',true);f.advance(2*86400000);assert.equal((await f.admin(b.id,'complete')).status,200);assert.equal((await review()).status,201);assert.equal((await review()).status,409);assert.deepEqual((await f.call('/api/reviews')).data,[]);
 const r=f.app.db.prepare('SELECT id FROM reviews').get();await f.admin(r.id,'publish');const publicReviews=(await f.call('/api/reviews')).data;assert.equal(publicReviews.length,1);assert.equal(publicReviews[0].rating,2);assert.equal(publicReviews[0].name,'Cliente');assert.equal(publicReviews[0].phone,undefined);
});
test('banco persiste ao reabrir o aplicativo',async t=>{
 const dir=mkdtempSync(resolve(work,'persistence-'));const first=createApp({dataDir:dir,adminToken:'test'});first.db.prepare('INSERT INTO audit(booking,action,created) VALUES (?,?,?)').run('test','persist',123);first.db.close();const second=createApp({dataDir:dir,adminToken:'test'});assert.equal(second.db.prepare('SELECT action FROM audit WHERE booking=?').get('test').action,'persist');second.db.close();
});
