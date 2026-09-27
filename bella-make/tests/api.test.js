import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';

test('Fluxo de compra, validação, privacidade e persistência',async t=>{
 const data=mkdtempSync(join(tmpdir(),'bella-test-'));
 let child;
 async function start(){child=spawn(process.execPath,['server.js'],{cwd:resolve('.'),env:{...process.env,PORT:'3097',DATA_DIR:data},stdio:['ignore','pipe','pipe']});let log='';await new Promise((ok,no)=>{child.stdout.on('data',d=>{log+=d;if(log.includes('Bella Make:'))ok()});child.on('error',no);child.on('exit',code=>no(new Error('Servidor saiu: '+code)));setTimeout(()=>no(new Error('Timeout de inicialização')),10000).unref()})}
 async function stop(){if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done}}
 t.after(async()=>{await stop();rmSync(data,{recursive:true,force:true})});await start();
 const call=async(path,{body,cookie,headers={}}={})=>{const r=await fetch('http://127.0.0.1:3097'+path,{method:body===undefined?'GET':'POST',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 let cookie;const address={name:'Cliente Teste',phone:'11999999999',cep:'01001000',street:'Rua de teste',number:'10',city:'São Paulo',state:'SP'};
 const payload=()=>({items:[{id:1,quantity:2,price:1}],coupon:'BELLA10',address,payment:'pix',requestId:randomUUID(),total:1});
 await t.test('catálogo público e arquivos privados protegidos',async()=>{assert.equal((await call('/api/products')).body.length,8);assert.equal((await call('/catalog.json')).status,404);assert.equal((await call('/data/store.sqlite')).status,404);assert.equal((await call('/api/orders')).status,401)});
 await t.test('cadastro e autenticação com validação',async()=>{assert.equal((await call('/api/register',{body:{name:'Teste',email:'teste@example.test',password:'123'}})).status,400);const r=await call('/api/register',{body:{name:'Cliente Teste',email:'teste@example.test',password:'Senha-de-teste-2026'}});assert.equal(r.status,200);cookie=r.cookie;assert.ok(cookie);assert.equal(r.body.user.password,undefined);assert.equal((await call('/api/me',{cookie})).body.user.name,'Cliente Teste');assert.equal((await call('/api/login',{body:{email:'teste@example.test',password:'Senha-incorreta'}})).status,401)});
 let order;
 await t.test('servidor determina valores, aplica cupom e não duplica pedidos',async()=>{const b=payload();const r=await call('/api/orders',{body:b,cookie});assert.equal(r.status,201);order=r.body;assert.equal(order.subtotal,3980);assert.equal(order.discount,398);assert.equal(order.total,3582);assert.equal(order.shipping,null);assert.equal((await call('/api/products')).body[0].stock,58);const retry=await call('/api/orders',{body:b,cookie});assert.equal(retry.body.id,order.id);assert.equal((await call('/api/products')).body[0].stock,58)});
 await t.test('validação de estoque, quantidades, cupom e origem',async()=>{for(const items of [[{id:1,quantity:99}],[{id:1,quantity:-1}],[{id:1,quantity:1.5}],[{id:1,quantity:1},{id:1,quantity:1}],[{id:999,quantity:1}]])assert.equal((await call('/api/orders',{cookie,body:{...payload(),items}})).status,400);assert.equal((await call('/api/orders',{cookie,body:{...payload(),coupon:'FALSO'}})).status,400);assert.equal((await call('/api/orders',{cookie,body:payload(),headers:{Origin:'https://evil.example'}})).status,403);assert.equal((await call('/api/products')).body[0].stock,58)});
 await t.test('pedidos isolados por conta e logout revoga sessão',async()=>{const other=await call('/api/register',{body:{name:'Outra Pessoa',email:'outro@example.test',password:'Senha-de-teste-2026'}});assert.deepEqual((await call('/api/orders',{cookie:other.cookie})).body,[]);assert.equal((await call('/api/orders',{cookie})).body[0].id,order.id);await call('/api/logout',{cookie:other.cookie,body:{}});assert.equal((await call('/api/orders',{cookie:other.cookie})).status,401)});
 await t.test('pedidos, sessão e estoque sobrevivem ao reinício',async()=>{await stop();await start();assert.equal((await call('/api/orders',{cookie})).body[0].id,order.id);assert.equal((await call('/api/products')).body[0].stock,58)});
});
