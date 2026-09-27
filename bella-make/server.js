import http from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(fileURLToPath(import.meta.url));
const data = resolve(process.env.DATA_DIR || resolve(root, 'data'));
mkdirSync(data, { recursive: true });
const db = new DatabaseSync(resolve(data, 'store.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, payload TEXT NOT NULL, stock INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),payload TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY,user_id INTEGER NOT NULL,order_id TEXT NOT NULL);
`);
for (const p of JSON.parse(readFileSync(resolve(root, 'catalog.json'), 'utf8'))) {
  db.prepare('INSERT INTO products VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(p.id, JSON.stringify(p), p.stock);
}
const products = () => db.prepare('SELECT * FROM products').all().map(r => ({ ...JSON.parse(r.payload), stock: r.stock }));
const hashToken = token => createHash('sha256').update(token).digest('hex');
function user(req) {
  const token = /(?:^|; )session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
  return token ? db.prepare('SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(hashToken(token), Date.now()) : null;
}
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
async function body(req) {
  let result = ''; for await (const chunk of req) { result += chunk; if (result.length > 20000) fail('Solicitação muito grande.', 413); }
  try { return JSON.parse(result); } catch { fail('Dados inválidos.'); }
}
const attempts = new Map();
function rateLimit(req) {
  const key = req.socket.remoteAddress;
  const now = Date.now();
  for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
  const entry = attempts.get(key) || { count: 0, until: now + 60000 };
  if (++entry.count > 30) fail('Muitas tentativas. Aguarde um minuto.', 429);
  attempts.set(key, entry);
}
const server = http.createServer(async (req, res) => {
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) fail('Origem não permitida.', 403);
      if (!req.headers['content-type']?.startsWith('application/json')) fail('Envie JSON.', 415);
      rateLimit(req);
    }
    if (url.pathname === '/api/products' && req.method === 'GET') return send(200, products());
    if (url.pathname === '/api/me' && req.method === 'GET') return send(200, { user: user(req) || null });
    if (['/api/register','/api/login'].includes(url.pathname) && req.method === 'POST') {
      const b = await body(req); const email = String(b.email || '').trim().toLowerCase(); const password = String(b.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150 || password.length < 8 || password.length > 128) fail('Informe um e-mail válido e uma senha de 8 a 128 caracteres.');
      let u;
      if (url.pathname === '/api/register') {
        const name = String(b.name || '').trim(); if (name.length < 2 || name.length > 80) fail('Informe seu nome (2 a 80 caracteres).');
        if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) fail('Este e-mail já está cadastrado. Entre na sua conta.');
        const salt = randomBytes(16).toString('hex'); const hash = scryptSync(password, salt, 64).toString('hex');
        const result = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name,email,`${salt}:${hash}`);
        u = { id: Number(result.lastInsertRowid), name, email };
      } else {
        u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        const [salt, hash] = (u?.password || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
        const valid = timingSafeEqual(scryptSync(password,salt,64), Buffer.from(hash,'hex'));
        if (!u || !valid) fail('E-mail ou senha incorretos.', 401);
      }
      const token = randomBytes(32).toString('hex');
      db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(token),u.id,Date.now()+604800000);
      res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`);
      return send(200, { user: { id:u.id,name:u.name,email:u.email } });
    }
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      const token = /(?:^|; )session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
      if(token) db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token));
      res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(200,{ok:true});
    }
    if (url.pathname === '/api/orders') {
      const u = user(req); if (!u) fail('Entre na sua conta para continuar.',401);
      if (req.method === 'GET') return send(200,db.prepare('SELECT payload FROM orders WHERE user_id=? ORDER BY created DESC').all(u.id).map(r=>JSON.parse(r.payload)));
      if (req.method === 'POST') {
        const b = await body(req);
        const key = String(b.requestId || ''); if (!/^[a-zA-Z0-9-]{16,80}$/.test(key)) fail('Identificador do pedido inválido.');
        const existing = db.prepare('SELECT o.payload FROM requests r JOIN orders o ON o.id=r.order_id WHERE r.key=? AND r.user_id=?').get(key,u.id);
        if (existing) return send(200,JSON.parse(existing.payload));
        if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) fail('Seu carrinho está vazio ou inválido.');
        const address = {};
        for (const field of ['name','phone','cep','street','number','city','state']) {
          address[field] = String(b.address?.[field] || '').trim();
          if (!address[field] || address[field].length > 160) fail('Preencha todos os dados de entrega.');
        }
        if (!/^\d{8}$/.test(address.cep.replace(/\D/g,'')) || !/^\d{10,11}$/.test(address.phone.replace(/\D/g,'')) || !/^[A-Za-z]{2}$/.test(address.state)) fail('Confira CEP, telefone e UF.');
        address.complement = String(b.address?.complement || '').slice(0,160);
        if (!['pix','card'].includes(b.payment)) fail('Selecione uma forma de pagamento.');
        db.exec('BEGIN IMMEDIATE');
        try {
          const seen = new Set(); const all = products();
          const items = b.items.map(i => {
            const p = all.find(p=>p.id===i.id);
            if (!p || seen.has(i.id) || !Number.isInteger(i.quantity) || i.quantity<1 || i.quantity>99) fail('Item ou quantidade inválida.');
            seen.add(i.id); if(p.stock<i.quantity) fail(`Estoque insuficiente: ${p.name}.`);
            return { id:p.id,name:p.name,price:p.price,quantity:i.quantity };
          });
          const subtotal = items.reduce((sum,i)=>sum+i.price*i.quantity,0);
          const coupon = String(b.coupon || '').trim().toUpperCase();
          if(coupon && coupon!=='BELLA10') fail('Cupom inválido.');
          const discount = coupon ? Math.round(subtotal*.1) : 0;
          const order = { id:`BM-${randomBytes(5).toString('hex').toUpperCase()}`,created:new Date().toISOString(),items,address,payment:b.payment,subtotal,discount,total:subtotal-discount,shipping:null,status:'Demonstração · sem cobrança',coupon };
          for(const i of items) db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(i.quantity,i.id);
          db.prepare('INSERT INTO orders VALUES(?,?,?,?)').run(order.id,u.id,JSON.stringify(order),order.created);
          db.prepare('INSERT INTO requests VALUES(?,?,?)').run(key,u.id,order.id);
          db.exec('COMMIT'); return send(201,order);
        } catch(e) { db.exec('ROLLBACK'); throw e; }
      }
    }
    if (url.pathname.startsWith('/api/')) return send(404,{error:'Rota não encontrada.'});
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405,{error:'Método não permitido.'});
    const publicRoot = resolve(root,'public');
    const file = resolve(publicRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if (!file.startsWith(publicRoot+sep) || !existsSync(file)) return send(404,{error:'Arquivo não encontrado.'});
    const bytes = readFileSync(file);
    res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:bytes);
  } catch(e) { if(!e.status) console.error(e); send(e.status || 500,{error:e.status?e.message:'Não foi possível concluir. Tente novamente.'}); }
});
server.listen(Number(process.env.PORT || 3000),'0.0.0.0',()=>console.log(`Bella Make: http://localhost:${process.env.PORT || 3000}`));
