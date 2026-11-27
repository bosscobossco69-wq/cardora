(function(){
'use strict';
// Preview only. Do not enable until reviewed schema, abuse/privacy checks and production approval.
const GROWTH_OPEN=true;
const allowed=['page_home','page_join','join_click','signup_submit','signup_response_ok','signup_failed','email_verified','seller_interest','partner_interest'];
const languages=['en','zh','ms','th'],words=[
 ['Optional usage statistics','Allow anonymous event counts to help improve this site. No email, password, card data, IP address or persistent identifier is stored by this feature. Hosting providers may keep their own logs.','Allow','Decline','Turn off usage statistics'],
 ['可选使用统计','允许匿名事件计数，帮助改善网站。本功能不保存邮箱、密码、卡牌资料、IP地址或持久身份标识。托管服务商可能保留自己的日志。','允许','拒绝','关闭使用统计'],
 ['Statistik penggunaan pilihan','Benarkan kiraan acara tanpa nama untuk menambah baik laman. Ciri ini tidak menyimpan e-mel, kata laluan, data kad, alamat IP atau pengecam kekal. Penyedia hos mungkin menyimpan log sendiri.','Benarkan','Tolak','Matikan statistik'],
 ['สถิติการใช้งานแบบเลือกได้','อนุญาตการนับเหตุการณ์แบบไม่ระบุตัวตนเพื่อปรับปรุงเว็บไซต์ ฟังก์ชันนี้ไม่จัดเก็บอีเมล รหัสผ่าน ข้อมูลการ์ด ที่อยู่ IP หรือตัวระบุถาวร ผู้ให้บริการโฮสต์อาจเก็บบันทึกของตนเอง','อนุญาต','ปฏิเสธ','ปิดสถิติการใช้งาน']
];
const safeGet=(store,k)=>{try{return store().getItem(k)}catch{return null}};
const safeSet=(store,k,v)=>{try{store().setItem(k,v);return true}catch{return false}};
const local=()=>localStorage,session=()=>sessionStorage;
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function classify(){
 try{
  const q=new URLSearchParams(location.search),tag=(q.get('utm_source')||'').toLowerCase();
  if(['facebook','tiktok','google'].includes(tag))return tag;
  if(tag)return 'other';
  if(!document.referrer)return 'direct';
  const h=new URL(document.referrer).hostname.toLowerCase();
  if(h===location.hostname)return null;
  if(h==='facebook.com'||h.endsWith('.facebook.com')||h==='fb.com')return 'facebook';
  if(h==='tiktok.com'||h.endsWith('.tiktok.com'))return 'tiktok';
  if(['google.com','google.com.my','google.co.th','google.co.uk','google.co.jp'].some(x=>h===x||h.endsWith('.'+x)))return 'google';
  return 'other';
 }catch{return 'other'}
}
const consent=()=>safeGet(local,'trixovel-growth-consent')==='yes';
function record(event){
 if(!GROWTH_OPEN||!consent()||!allowed.includes(event)||navigator.globalPrivacyControl===true||navigator.doNotTrack==='1')return;
 const key='trx-growth:'+day()+':'+event;
 if(safeGet(session,key)||!safeSet(session,key,'1'))return;
 const src=classify(),saved=safeGet(session,'trx-growth-source'),source=src&&src!=='direct'?src: saved||src||'direct';
 if(!safeSet(session,'trx-growth-source',source))return;
 try{fetch('https://fdkfquvzbswxocyrhduk.supabase.co/rest/v1/rpc/cardora_record_growth_event',{method:'POST',headers:{apikey:'sb_publishable_V99GEROTQ492-d_w2QIoGg_RWx8DqwT','Content-Type':'application/json'},body:JSON.stringify({p_event:event,p_source:source}),credentials:'omit',cache:'no-store',keepalive:true}).catch(()=>{});}catch{}
}
window.TRXGrowth=Object.freeze({record});
if(!GROWTH_OPEN)return;
const page=location.pathname==='/'||location.pathname==='/index.html'?'page_home':location.pathname==='/join.html'?'page_join':null;
const root=document.getElementById('growthPrivacy');
if(!root)return;
function render(){
 const i=Math.max(0,languages.indexOf(safeGet(local,'trixovel-language')||'en')),w=words[i];
 root.replaceChildren();
 const title=document.createElement('strong');title.textContent=w[0];root.append(title);
 const p=document.createElement('p');p.textContent=w[1];root.append(p);
 const choice=safeGet(local,'trixovel-growth-consent');
 const add=(label,value)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{safeSet(local,'trixovel-growth-consent',value);if(value==='yes'&&page)record(page);render()};root.append(b)};
 if(choice==='yes')add(w[4],'no');else{add(w[2],'yes');add(w[3],'no')}
}
root.hidden=false;render();if(page)record(page);
document.addEventListener('click',e=>{const el=e.target.closest?.('[data-growth]');if(el)record(el.dataset.growth);if(e.target.closest?.('#en,#zh,#ms,#th,[data-lang]'))setTimeout(render,0);});
})();
