export const services = [
 {id:'fibra',name:'Fibras de Vidro',price:15000,duration:180,description:'Inclui esmaltação em gel e cuticulagem russa.',tag:'Aplicação',decoratable:true},
 {id:'molde-f1',name:'Molde F1',price:12000,duration:150,description:'Inclui esmaltação em gel e cuticulagem russa.',tag:'Aplicação',decoratable:true},
 {id:'banho-gel',name:'Banho de Gel',price:11000,duration:120,description:'Inclui esmaltação em gel e cuticulagem russa.',tag:'Aplicação',decoratable:true},
 {id:'soft-gel',name:'Soft gel',price:10000,duration:120,description:'Inclui esmaltação em gel e cuticulagem russa.',tag:'Aplicação',decoratable:true},
 {id:'manutencao-fibra',name:'Manutenção Fibra de Vidro',price:12000,duration:150,description:'Cuidado e renovação do alongamento em fibra.',tag:'Manutenção',decoratable:true},
 {id:'manutencao-gel',name:'Manutenção de Gel',price:10000,duration:120,description:'Renovação da estrutura das unhas em gel.',tag:'Manutenção',decoratable:true},
 {id:'manutencao-soft',name:'Manutenção soft gel',price:8000,duration:120,description:'Manutenção do seu alongamento soft gel.',tag:'Manutenção',decoratable:true},
 {id:'reposicao',name:'Reposição Unha de Gel',price:700,duration:30,description:'Valor por unha. Escolha a quantidade ao agendar.',tag:'Por unidade',perUnit:true},
 {id:'pedicure-russa',name:'Pedicure russa',price:7000,duration:90,description:'Cuidado dos pés com a técnica de cuticulagem russa.',tag:'Pedicures'},
 {id:'spa-pes',name:'Spa dos pés',price:10000,duration:90,description:'Uma pausa dedicada ao cuidado dos seus pés.',tag:'Pedicures'},
 {id:'pedicure-tradicional',name:'Pedicure tradicional',price:3000,duration:60,description:'Cuidado clássico para seus pés.',tag:'Pedicures'},
 {id:'remocao',name:'Remoção Alongamento',price:3000,duration:60,description:'Remoção do alongamento com cuidado.',tag:'Cuidados'},
];
export const addons=[
 {id:'art-1',name:'Nail art nível I',price:3000,duration:30},
 {id:'art-2',name:'Nail art nível II',price:4000,duration:30},
 {id:'art-3',name:'Nail art nível III',price:6000,duration:60},
 {id:'art-4',name:'Nail art nível IV',price:7000,duration:60},
 {id:'art-5',name:'Nail art nível V',price:8000,duration:90},
];
export function quote(service,addon='',quantity=1){
 const s=services.find(s=>s.id===service);if(!s)throw Error('Escolha um procedimento válido.');
 if(!Number.isInteger(quantity)||quantity<1||quantity>10||(!s.perUnit&&quantity!==1))throw Error('Quantidade inválida.');
 const a=addon?addons.find(a=>a.id===addon):null;
 if(addon&&(!a||!s.decoratable))throw Error('Decoração não disponível para este procedimento.');
 return {...s,price:s.price*quantity+(a?.price||0),duration:s.duration*quantity+(a?.duration||0),label:s.name+(s.perUnit?' · '+quantity+' unha(s)':'')+(a?' + '+a.name:'')};
}
export const policy={maxDays:10,depositPercent:50,openMinute:540,closeMinute:1080,closedWeekdays:[0],holdMinutes:30,pixKey:'84981870533',pixDisplay:'84981870533',contactPhone:'84999021993',whatsapp:'5584999021993'};
export const today=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export const addDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
export const keys=(day,time,duration)=>Array.from({length:duration/30},(_,i)=>`${day}:${minutes(time)+i*30}`);
export function validDate(day,time,duration,now=Date.now()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:(00|30)$/.test(time))return false;
 const date=new Date(day+'T12:00:00Z');
 return !isNaN(date.valueOf())&&date.toISOString().slice(0,10)===day&&day>=today(now)&&day<=addDays(today(now),policy.maxDays)&&!policy.closedWeekdays.includes(date.getUTCDay())&&minutes(time)>=policy.openMinute&&minutes(time)+duration<=policy.closeMinute&&Date.parse(`${day}T${time}:00-03:00`)>now+3600000;
}
