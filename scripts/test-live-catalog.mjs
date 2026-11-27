import assert from 'node:assert/strict';
const origin='https://trixovel.com';
const checks=[
 {name:'Pokemon TCGdex',url:'https://api.tcgdex.net/v2/en/cards?name=Pikachu&pagination%3Apage=1&pagination%3AitemsPerPage=20',validate:x=>Array.isArray(x)&&x.length>0&&x.length<=20&&x.every(r=>typeof r.id==='string'&&typeof r.name==='string'&&typeof r.localId==='string'),cors:true},
 {name:'Yu-Gi-Oh YGOPRODeck',url:'https://db.ygoprodeck.com/api/v7/cardinfo.php?id=46986414&num=20&offset=0',validate:x=>Array.isArray(x?.data)&&x.data.some(r=>r.id===46986414&&r.name==='Dark Magician'),cors:true},
 {name:'One Piece OPTCG candidate',url:'https://optcgapi.com/api/sets/card/OP01-001/',validate:x=>{const rows=Array.isArray(x)?x:[x];return rows.some(r=>r&&r.card_set_id==='OP01-001'&&typeof r.card_name==='string'&&r.card_name.replace(/ \(001\)$/,'')==='Roronoa Zoro')},cors:true}
];
let failed=0;
for(const c of checks){
 try{
  const res=await fetch(c.url,{headers:{Origin:origin,Accept:'application/json'},signal:AbortSignal.timeout(12000),redirect:'error',credentials:'omit'});
  assert.ok(res.ok,'HTTP '+res.status);
  const cors=res.headers.get('access-control-allow-origin');
  const data=await res.json();
  if(c.name.startsWith('One Piece')){
   const row=Array.isArray(data)?data[0]:data;
   const list=Array.isArray(row?.data)?row.data:Array.isArray(row?.results)?row.results:[row];
   console.log('One Piece response shape: '+JSON.stringify({array:Array.isArray(data),keys:Object.keys(row||{}),rowKeys:Object.keys(list[0]||{}),sample:Object.fromEntries(Object.entries(list[0]||{}).filter(([k,v])=>/^(card_)?(name|id|number|code|set_id|set_name)$/i.test(k)&&['string','number'].includes(typeof v)).map(([k,v])=>[k,String(v).slice(0,120)])),cors:cors||'absent'}));
  }
  assert.ok(c.validate(data),'unexpected public reference response');
  console.log(c.name+': valid JSON; CORS '+(cors||'absent'));
  if(c.cors)assert.ok(cors==='*'||cors===origin,'browser origin not allowed');
  console.log('PASS: '+c.name+' reference and browser-origin header');
  if(c.name.startsWith('One Piece'))console.log('One Piece response fields: '+Object.keys(Array.isArray(data)?data[0]:data).sort().join(', '));
 }catch(e){failed++;console.error('FAIL: '+c.name+': '+e.message)}
}
if(failed)process.exitCode=1;
