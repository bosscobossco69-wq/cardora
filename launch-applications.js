(function(){
'use strict';
// Release gate: keep false until the new SQL is approved, deployed and tested.
// Never toggle this to restore the legacy seller_applications path.
const APPLICATIONS_OPEN=false;
const $=id=>document.getElementById(id),words=window.TRXLaunchWords;
const LANGS=['en','zh','ms','th'];
const mode=document.body.dataset.mode;
const TABLE='cardora_launch_applications';
const FIELDS='id,owner_id,kind,name,region,contact,categories,details,status,created_at';
const fields=['kind','appName','region','contact','categories','details','consent','submit'];
const url='https://fdkfquvzbswxocyrhduk.supabase.co', key="sb_publishable_V99GEROTQ492-d_w2QIoGg_RWx8DqwT";
const client=window.supabase?.createClient(url,key,{auth:{storageKey:'cardora-member-v1',flowType:'pkce',persistSession:true,autoRefreshToken:true}});
let lang='en',status='pending',generation=0,identity=null,rows=[],busy=false,stats=null;
const tr=k=>words[k]?.[LANGS.indexOf(lang)]||k;
function setStatus(k){status=k;$('appStatus').textContent=tr(k);}
function controls(enabled){for(const id of fields)if($(id))$(id).disabled=!enabled;}
function clearFields(){for(const id of fields){const el=$(id);if(!el)continue;if(id==='consent')el.checked=false;else if(id!=='submit')el.value=id==='kind'?(typeof location!=='undefined'&&new URLSearchParams(location.search||'').get('kind')==='partner'?'partner':'seller'):'';}}
function invalidate(){generation++;identity=null;rows=[];busy=false;controls(false);clearFields();$('records').replaceChildren();}
function bounded(p,ms=12000){let timer;return Promise.race([Promise.resolve(p),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),ms);})]).finally(()=>clearTimeout(timer));}
async function checkedUser(){
 const {data,error}=await bounded(client.auth.getUser());if(error||!data?.user||!data.user.email_confirmed_at||data.user.is_anonymous)return null;
 const u=data.user;
 const result=await bounded(client.from('users').select('status,role').eq('auth_user_id',u.id).maybeSingle());
 if(result.error||result.data?.status!=='active'||(mode==='admin'&&result.data.role!=='admin'))return null;
 const again=await bounded(client.auth.getUser());
 return !again.error&&again.data?.user?.id===u.id&&again.data.user.email_confirmed_at&&!again.data.user.is_anonymous?u:null;
}
function render(){
 const root=$('records');root.replaceChildren();
 if(!APPLICATIONS_OPEN||!identity)return;
 if(!rows.length){const p=document.createElement('p');p.textContent=tr('noRecords');root.append(p);return;}
 for(const row of rows){
  const a=document.createElement('article');a.className='feature';
  const h=document.createElement('h3');h.textContent=tr(row.kind==='seller'?'seller':'partner')+' · '+tr(row.status==='pending'?'pendingStatus':row.status);a.append(h);
  for(const k of ['name','region','contact','categories','details']){if(!row[k])continue;const p=document.createElement('p');p.textContent=String(row[k]);a.append(p);}
  if(mode==='admin'&&row.owner_id!==identity&&['pending','contacted'].includes(row.status)){
   const actions=document.createElement('div');actions.className='review-actions';
   for(const decision of ['contacted','accepted','rejected']){const b=document.createElement('button');b.type='button';b.textContent=tr(decision);b.disabled=busy;b.addEventListener('click',()=>decide(row.id,decision));actions.append(b);}
   a.append(actions);
  }
  root.append(a);
 }
}
async function load(){
 invalidate();const g=generation;
 if(!APPLICATIONS_OPEN){setStatus('pending');return;}
 setStatus('waiting');
 try{
  const u=await checkedUser();if(g!==generation)return;if(!u){setStatus('noAccess');return;}
  let q=client.from(TABLE).select(FIELDS);if(mode!=='admin')q=q.eq('owner_id',u.id);
  const {data,error}=await bounded(q.order('created_at',{ascending:false}).limit(100));
  if(g!==generation)return;
  const again=await checkedUser();if(g!==generation)return;if(error||!again||again.id!==u.id||!Array.isArray(data))throw Error('read');
  identity=u.id;rows=data.filter(r=>mode==='admin'||r.owner_id===u.id);
  setStatus('');controls(mode==='public');render();
 }catch{if(g===generation){invalidate();setStatus('error');}}
}
async function submit(e){
 e.preventDefault();if(!APPLICATIONS_OPEN||mode!=='public'||!identity||busy||!$('consent').checked)return;
 const g=generation,id=identity,p={owner_id:id,kind:$('kind').value,name:$('appName').value.trim(),region:$('region').value.trim(),contact:$('contact').value.trim(),categories:$('categories').value.trim(),details:$('details').value.trim()};
 if(!['seller','partner'].includes(p.kind)||rows.some(r=>r.kind===p.kind)||!$('applicationForm').reportValidity()){setStatus('error');return;}
 busy=true;controls(false);
 try{
  const u=await checkedUser();if(g!==generation)return;if(!u||u.id!==id)throw Error('identity');
  const {data,error}=await bounded(client.from(TABLE).insert(p).select(FIELDS).single());if(g!==generation)return;
  if(error||!data||data.owner_id!==id||data.status!=='pending')throw Error('submit');
  await load();if(identity===id)setStatus('saved');
 }catch{if(g===generation){invalidate();setStatus('error');}}
}
async function decide(id,decision){
 if(!APPLICATIONS_OPEN||mode!=='admin'||!identity||busy||!['contacted','accepted','rejected'].includes(decision))return;
 const row=rows.find(r=>r.id===id);if(!row||row.owner_id===identity||!['pending','contacted'].includes(row.status)||!window.confirm(tr('confirm')))return;
 const g=generation,uid=identity;busy=true;render();
 try{
  const u=await checkedUser();if(g!==generation)return;if(!u||u.id!==uid)throw Error('identity');
  const {data,error}=await bounded(client.from(TABLE).update({status:decision}).eq('id',id).eq('status',row.status).select(FIELDS).single());if(g!==generation)return;
  if(error||!data||data.id!==id||data.status!==decision)throw Error('review');
  await load();if(identity===uid)setStatus('reviewed');
 }catch{if(g===generation){invalidate();setStatus('error');}}
}
function dayMYT(t){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(t).map(p=>[p.type,p.value]));return [p.year,p.month,p.day].join('-');}
function validStats(r){if(!r)return false;const n=[r.registered_members,r.verified_members,r.new_today],t=Date.parse(r.measured_at),now=Date.now();return n.every(v=>Number.isSafeInteger(v)&&v>=0)&&n[1]<=n[0]&&n[2]<=n[0]&&Number.isFinite(t)&&now-t<=360000&&t<=now+30000&&r.day_myt===dayMYT(new Date(now));}
function renderStats(){if(mode!=='public')return;const good=validStats(stats);for(const [id,k] of [['registered','registered_members'],['verified','verified_members'],['today','new_today']])$(id).textContent=good?String(stats[k]):'—';$('statsStatus').textContent=good?tr('last')+new Intl.DateTimeFormat(['en-GB','zh-CN','ms-MY','th-TH-u-ca-gregory'][LANGS.indexOf(lang)],{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'}).format(new Date(stats.measured_at)):tr('unavailable');}
async function fetchStats(){if(mode!=='public'||document.hidden)return;const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8000);try{const r=await fetch(url+'/rest/v1/cardora_community_snapshot?select=registered_members,verified_members,new_today,day_myt,measured_at&singleton=eq.true',{headers:{apikey:key,Accept:'application/json'},credentials:'omit',cache:'no-store',signal:ctrl.signal});if(!r.ok)throw Error('stats');const d=await r.json();stats=Array.isArray(d)&&d.length===1&&validStats(d[0])?d[0]:null;}catch{stats=null;}finally{clearTimeout(timer);renderStats();}}
function language(v){lang=LANGS.includes(v)?v:'en';document.documentElement.lang=lang==='zh'?'zh-Hans':lang;$('lang').value=lang;for(const el of document.querySelectorAll('[data-t]'))el.textContent=tr(el.dataset.t);setStatus(status);render();renderStats();try{localStorage.setItem('trixovel-language',lang)}catch{}}
$('lang').addEventListener('change',()=>language($('lang').value));$('reload').addEventListener('click',load);$('applicationForm')?.addEventListener('submit',submit);
if($('kind')&&typeof location!=='undefined'&&new URLSearchParams(location.search||'').get('kind')==='partner')$('kind').value='partner';
try{language(localStorage.getItem('trixovel-language')||'en')}catch{language('en')}
if(APPLICATIONS_OPEN&&client){client.auth.onAuthStateChange((event)=>{if(['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event)){invalidate();setTimeout(load,0);}});load();}else{controls(false);setStatus('pending');}
fetchStats();setInterval(()=>{renderStats();fetchStats();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderStats();fetchStats();}});
})();
