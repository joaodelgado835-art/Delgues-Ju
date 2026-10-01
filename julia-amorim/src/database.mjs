import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export function openDatabase(file){
 if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
 const db=new DatabaseSync(file);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS bookings (
 id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,service TEXT NOT NULL,day TEXT NOT NULL,time TEXT NOT NULL,duration INTEGER NOT NULL,
 name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,total INTEGER NOT NULL,deposit INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','review','confirmed','completed','cancelled','expired')),
 receipt TEXT,receipt_type TEXT,created INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS bookings_day ON bookings(day,time);
 CREATE TABLE IF NOT EXISTS slots(key TEXT PRIMARY KEY,booking TEXT NOT NULL REFERENCES bookings(id));
 CREATE INDEX IF NOT EXISTS slots_booking ON slots(booking);
 CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,booking TEXT UNIQUE NOT NULL REFERENCES bookings(id),name TEXT NOT NULL,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),body TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,booking TEXT NOT NULL,action TEXT NOT NULL,created INTEGER NOT NULL);
 `);
 const columns=new Set(db.prepare('PRAGMA table_info(bookings)').all().map(c=>c.name));
 if(!columns.has('service_name'))db.exec("ALTER TABLE bookings ADD COLUMN service_name TEXT NOT NULL DEFAULT ''; ALTER TABLE bookings ADD COLUMN addon TEXT NOT NULL DEFAULT ''; ALTER TABLE bookings ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1; PRAGMA user_version=2;");
 const legacy={manicure:'Manicure clássica',pedicure:'Pedicure completa',gel:'Esmaltação em gel',alongamento:'Alongamento em gel',manutencao:'Manutenção de gel',nailart:'Gel + nail art delicada'};
 for(const [id,name] of Object.entries(legacy))db.prepare("UPDATE bookings SET service_name=? WHERE service=? AND service_name=''").run(name,id);
 return db;
}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
export function cleanup(db,now=Date.now()){transaction(db,()=>{
 db.prepare("DELETE FROM slots WHERE booking IN (SELECT id FROM bookings WHERE status='pending' AND expires < ?)").run(now);
 db.prepare("UPDATE bookings SET status='expired' WHERE status='pending' AND expires < ?").run(now);
 db.prepare('DELETE FROM limits WHERE expires < ?').run(now);
});}

