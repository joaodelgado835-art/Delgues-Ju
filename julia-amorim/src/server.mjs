import http from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync} from 'node:fs';
import {resolve,dirname,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {openDatabase,transaction,cleanup} from './database.mjs';
import {services,addons,quote,policy,today,addDays,keys,validDate} from './catalog.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=s=>createHash('sha256').update(s).digest('hex');
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,msg)=>{throw new HttpError(status,msg);};
async function body(req,max=12000){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>max)fail(413,'Arquivo ou dados acima do limite.');parts.push(chunk);}return Buffer.concat(parts);}
async function data(req){try{return JSON.parse((await body(req)).toString('utf8'));}catch(e){if(e.status)throw e;fail(400,'Dados inválidos.');}}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
export function createApp({dataDir=join(root,'data'),adminToken,now=()=>Date.now()}={}){
 mkdirSync(dataDir,{recursive:true});mkdirSync(join(dataDir,'receipts'),{recursive:true});
 const db=openDatabase(join(dataDir,'atelier.sqlite'));
 const tokenFile=join(dataDir,'admin-token.txt');
 if(!adminToken){if(!existsSync(tokenFile))writeFileSync(tokenFile,randomBytes(24).toString('base64url'),{mode:0o600});adminToken=readFileSync(tokenFile,'utf8').trim();}
 const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(path.startsWith('/api/')){
  if(req.headers.origin){let o;try{o=new URL(req.headers.origin);}catch{fail(403,'Origem inválida.');}if(o.host!==req.headers.host)fail(403,'Origem inválida.');}
  if(req.headers['sec-fetch-site']==='cross-site')fail(403,'Origem inválida.');
  cleanup(db,now());
  const send=(value,status=200)=>json(res,status,value);
  const rate=(kind,max)=>{const key=hash(`${req.socket.remoteAddress}:${kind}:${Math.floor(now()/3600000)}`);const r=db.prepare('INSERT INTO limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').get(key,now()+3600000);if(r.count>max)fail(429,'Muitas tentativas. Tente novamente mais tarde.');};
  const admin=()=>{rate('admin',300);const t=(req.headers.authorization||'').replace(/^Bearer /,'');if(!t||!timingSafeEqual(Buffer.from(hash(t)),Buffer.from(hash(adminToken)))){rate('admin-failed',15);fail(401,'Chave de acesso inválida.');}};
  const own=id=>{const t=String(req.headers['x-booking-token']||'');const b=db.prepare('SELECT * FROM bookings WHERE id=? AND token_hash=?').get(id,hash(t));if(!b)fail(404,'Reserva não encontrada. Confira seu link.');return b;};
  if(path==='/api/catalog'&&req.method==='GET')return send({services,addons,policy,today:today(now()),maxDay:addDays(today(now()),policy.maxDays)});
  if(path==='/api/availability'&&req.method==='GET'){
   let s;try{s=quote(url.searchParams.get('service'),url.searchParams.get('addon')||'',Number(url.searchParams.get('quantity')||1));}catch(e){fail(400,e.message);}const day=url.searchParams.get('day')||'';if(!/^\d{4}-\d{2}-\d{2}$/.test(day))fail(400,'Escolha o serviço e a data.');
   const occupied=new Set(db.prepare('SELECT key FROM slots WHERE key LIKE ?').all(day+':%').map(r=>r.key));const times=[];
   for(let m=policy.openMinute;m<policy.closeMinute;m+=30){const t=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;if(validDate(day,t,s.duration,now())&&keys(day,t,s.duration).every(k=>!occupied.has(k)))times.push(t);}
   return send({times});
  }
  if(path==='/api/bookings'&&req.method==='POST'){
   rate('booking',8);const b=await data(req);let s;try{s=quote(b.service,b.addon||'',b.quantity??1);}catch(e){fail(400,e.message);}
   const name=String(b.name||'').trim(),phone=String(b.phone||'').replace(/\D/g,''),email=String(b.email||'').trim(),day=String(b.day||''),time=String(b.time||'');
   if(!s||!validDate(day,time,s.duration,now())||name.length<3||name.length>80||!/^\d{10,11}$/.test(phone)||email.length>150||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||b.consent!==true)fail(400,'Confira seus dados, a data, o horário e a autorização de contato.');
   const id=randomUUID(),token=randomBytes(32).toString('base64url'),expires=now()+policy.holdMinutes*60000,deposit=Math.ceil(s.price*policy.depositPercent/100);
   try{transaction(db,()=>{db.prepare('INSERT INTO bookings(id,token_hash,service,day,time,duration,name,phone,email,total,deposit,status,created,expires) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,hash(token),s.id,day,time,s.duration,name,phone,email,s.price,deposit,'pending',now(),expires);db.prepare('UPDATE bookings SET service_name=?,addon=?,quantity=? WHERE id=?').run(s.label,b.addon||'',b.quantity??1,id);for(const k of keys(day,time,s.duration))db.prepare('INSERT INTO slots(key,booking) VALUES (?,?)').run(k,id);});}catch(e){if(String(e).includes('UNIQUE'))fail(409,'Esse horário acabou de ser escolhido. Selecione outro.');throw e;}
   return send({id,token,expires,total:s.price,deposit},201);
  }
  const match=path.match(/^\/api\/bookings\/([a-f0-9-]{36})(\/receipt)?$/);
  if(match){const b=own(match[1]);
   if(!match[2]&&req.method==='GET'){const {token_hash,receipt,receipt_type,...safe}=b;return send({...safe,hasReceipt:!!receipt,pix:b.status==='pending'?policy.pixKey:null});}
   if(!match[2]&&req.method==='DELETE'){
    if(!['pending','expired'].includes(b.status))fail(409,'Após enviar o comprovante, combine o cancelamento com Julia.');
    transaction(db,()=>{db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(b.id);db.prepare('DELETE FROM slots WHERE booking=?').run(b.id);});return send({ok:true});
   }
   if(match[2]&&req.method==='POST'){
    rate('receipt',15);if(b.status!=='pending'||b.expires<now())fail(409,'Prazo encerrado ou comprovante já enviado. Consulte o status antes de pagar.');
    const bytes=await body(req,5_000_000);const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!png&&!jpg)fail(400,'Envie um comprovante JPG ou PNG de até 5 MB.');
    const filename=randomUUID()+'.'+(png?'png':'jpg'),file=join(dataDir,'receipts',filename);writeFileSync(file,bytes,{mode:0o600});
    const change=db.prepare("UPDATE bookings SET receipt=?,receipt_type=?,status='review' WHERE id=? AND status='pending' AND expires>=?").run(filename,png?'image/png':'image/jpeg',b.id,now());
    if(!change.changes){unlinkSync(file);fail(409,'O prazo terminou. Fale com Julia se você já pagou.');}
    return send({ok:true,status:'review'});
   }
  }
  if(path==='/api/reviews'&&req.method==='GET')return send(db.prepare("SELECT id,name,rating,body,created FROM reviews WHERE status='published' ORDER BY created DESC LIMIT 30").all());
  if(path==='/api/reviews'&&req.method==='POST'){
   rate('reviews',10);const d=await data(req),b=own(String(d.booking||''));if(b.status!=='completed')fail(403,'A avaliação fica disponível após o atendimento, pelo link da reserva.');
   const text=String(d.body||'').trim(),rating=Number(d.rating);if(text.length<5||text.length>600||!Number.isInteger(rating)||rating<1||rating>5||d.consent!==true)fail(400,'Preencha a nota, o texto e autorize a publicação.');
   try{db.prepare('INSERT INTO reviews(id,booking,name,rating,body,status,created) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),b.id,b.name.split(' ')[0],rating,text,'pending',now());}catch(e){if(String(e).includes('UNIQUE'))fail(409,'Você já enviou sua avaliação. Obrigada!');throw e;}return send({ok:true},201);
  }
  if(path==='/api/admin'){
   admin();if(req.method==='GET'){
    const id=url.searchParams.get('receipt');if(id){const b=db.prepare('SELECT receipt,receipt_type FROM bookings WHERE id=?').get(id);if(!b?.receipt)fail(404,'Comprovante não encontrado.');res.writeHead(200,{'Content-Type':b.receipt_type,'Cache-Control':'no-store'});return res.end(readFileSync(join(dataDir,'receipts',b.receipt)));}
    return send({bookings:db.prepare('SELECT id,service,service_name,addon,quantity,day,time,duration,name,phone,email,total,deposit,status,receipt FROM bookings ORDER BY day DESC,time DESC LIMIT 300').all(),reviews:db.prepare('SELECT * FROM reviews ORDER BY created DESC LIMIT 100').all()});
   }
   if(req.method==='POST'){
    const d=await data(req);if(['publish','hide'].includes(d.action)){db.prepare('UPDATE reviews SET status=? WHERE id=?').run(d.action==='publish'?'published':'hidden',d.id);return send({ok:true});}
    const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(d.id);if(!b)fail(404,'Reserva não encontrada.');
    const next={confirm:'confirmed',complete:'completed',cancel:'cancelled'}[d.action];if(!next)fail(400,'Ação inválida.');
    if(d.action==='confirm'&&(b.status!=='review'||!b.receipt||d.received!==true))fail(409,'Confira o crédito do Pix no banco antes de confirmar.');
    if(d.action==='complete'&&(b.status!=='confirmed'||Date.parse(`${b.day}T${b.time}:00-03:00`)+b.duration*60000>now()))fail(409,'Conclua somente após o horário do atendimento.');
    if(d.action==='cancel'&&!['pending','review','confirmed'].includes(b.status))fail(409,'Esta reserva não pode ser cancelada.');
    transaction(db,()=>{db.prepare('UPDATE bookings SET status=? WHERE id=?').run(next,b.id);if(next==='cancelled')db.prepare('DELETE FROM slots WHERE booking=?').run(b.id);db.prepare('INSERT INTO audit(booking,action,created) VALUES (?,?,?)').run(b.id,d.action,now());});return send({ok:true});
   }
  }
  fail(404,'Recurso não encontrado.');
 }
 if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Método não permitido.');
 const files={'/':'index.html','/reserva':'reservation.html','/admin':'admin.html'};
 const relative=files[path]||decodeURIComponent(path).replace(/^\//,'');
 // Somente arquivos públicos: nunca servir banco, tokens ou comprovantes.
 if(!/^(index\.html|reservation\.html|admin\.html|app\.js|reservation\.js|admin\.js|style\.css|favicon\.svg|images\/[a-z-]+\.png)$/.test(relative))fail(404,'Página não encontrada.');
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
 const bytes=readFileSync(join(root,'public',relative));res.writeHead(200,{'Content-Type':types[extname(relative)],'Cache-Control':relative.startsWith('images/')?'public, max-age=86400':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(e){if(!e.status)console.error('Request failed:',e.message);if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Não foi possível concluir. Tente novamente.'});else res.end();}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,db,close:()=>new Promise(resolve=>server.close(()=>{db.close();resolve();}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=createApp({adminToken:process.env.ADMIN_TOKEN,dataDir:process.env.DATA_DIR||join(root,'data')});
 const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 app.server.listen(port,host,()=>console.log(`Julia Amorim: http://${host}:${port}\nPainel: http://${host}:${port}/admin\nChave local: data/admin-token.txt`));
}

