(function(){
'use strict';
const GROWTH_OPEN=false;
const W={title:['Growth insights','网站增长统计','Statistik pertumbuhan','ข้อมูลการเติบโต'],intro:['Admin-only, opt-in browser event counts. Not unique visitors or confirmed signups. Client signals can be biased or spoofed.','仅管理员可见的自愿匿名浏览器事件计数，不是独立访客或真实注册人数，可能有偏差或被伪造。','Kiraan acara pilihan untuk pentadbir sahaja. Bukan pelawat unik atau pendaftaran disahkan. Isyarat boleh berat sebelah atau dipalsukan.','สถิติเหตุการณ์ตามความยินยอมสำหรับผู้ดูแล ไม่ใช่ผู้เข้าชมไม่ซ้ำหรือสมาชิกยืนยัน สัญญาณอาจคลาดเคลื่อนหรือปลอมแปลงได้'],report:['Last 30 days · Malaysia time','最近30天 · 马来西亚时间','30 hari terakhir · waktu Malaysia','30 วันที่ผ่านมา · เวลามาเลเซีย'],reload:['Refresh','刷新','Muat semula','รีเฟรช'],members:['Verified membership statistics','真实会员统计','Statistik keahlian disahkan','สถิติสมาชิกที่ยืนยันแล้ว'],independent:['Use the independently calculated public membership snapshot. Signup response counts do not prove a new account was created.','请以独立计算的真实会员汇总为准。注册接口响应计数不代表成功新增会员。','Rujuk ringkasan keahlian awam yang dikira berasingan. Respons pendaftaran tidak membuktikan akaun baharu.','ใช้สถิติสมาชิกสาธารณะที่คำนวณแยกกัน การตอบสนองการสมัครไม่ยืนยันว่ามีบัญชีใหม่'],snapshot:['Open public snapshot','打开真实会员统计','Buka ringkasan awam','เปิดสถิติสาธารณะ'],review:['Application review','申请审核','Semakan permohonan','ตรวจสอบใบสมัคร'],closed:['Measurement is not enabled yet.','统计尚未启用。','Statistik belum diaktifkan.','ยังไม่เปิดสถิติ'],denied:['Verified active administrator required.','需要已验证的有效管理员。','Pentadbir aktif disahkan diperlukan.','ต้องเป็นผู้ดูแลที่ยืนยันและใช้งานได้'],unavailable:['Data unavailable.','数据暂不可用。','Data tidak tersedia.','ข้อมูลไม่พร้อมใช้งาน'],empty:['No measured events yet; not zero visitors.','尚无采集事件，不代表没有访客。','Belum ada acara direkod; bukan sifar pelawat.','ยังไม่มีเหตุการณ์ที่วัดได้ ไม่ได้แปลว่าไม่มีผู้เข้าชม'],day:['Date','日期','Tarikh','วันที่'],source:['Source','来源','Sumber','แหล่งที่มา'],event:['Event','事件','Acara','เหตุการณ์'],hits:['Count','次数','Bilangan','จำนวน'],page_home:['Home views','首页浏览','Paparan utama','ดูหน้าแรก'],page_join:['Member entry views','会员入口浏览','Paparan ahli','ดูหน้าสมาชิก'],join_click:['Registration clicks','注册入口点击','Klik daftar','คลิกสมัคร'],signup_submit:['Signup requests','注册请求','Permintaan daftar','คำขอสมัคร'],signup_response_ok:['Accepted signup responses','注册接口正常响应','Respons daftar diterima','การตอบสนองสมัครสำเร็จ'],signup_failed:['Signup errors','注册流程错误','Ralat daftar','ข้อผิดพลาดการสมัคร'],email_verified:['Email verification flow success','邮箱验证流程成功','Pengesahan e-mel berjaya','ขั้นตอนยืนยันอีเมลสำเร็จ'],seller_interest:['Seller preview clicks','卖家预览点击','Klik pratonton penjual','คลิกตัวอย่างผู้ขาย'],partner_interest:['Partner preview clicks','代理预览点击','Klik pratonton rakan','คลิกตัวอย่างพันธมิตร']};
const $=id=>document.getElementById(id), langs=['en','zh','ms','th'];let lang='en',g=0,rows=[],status='closed';
function tr(k){return W[k]?.[langs.indexOf(lang)]||k;}
function render(){document.documentElement.lang=lang==='zh'?'zh-Hans':lang;for(const el of document.querySelectorAll('[data-g]'))el.textContent=tr(el.dataset.g);$('status').textContent=tr(status);$('report').replaceChildren();if(!rows.length)return;const table=document.createElement('table'),head=document.createElement('tr');for(const k of ['day','source','event','hits']){const th=document.createElement('th');th.textContent=tr(k);head.append(th)}table.append(head);for(const r of rows){const row=document.createElement('tr');for(const val of [r.day_myt,r.source,tr(r.event),r.hits]){const td=document.createElement('td');td.textContent=String(val);row.append(td)}table.append(row)}$('report').append(table)}
function setLang(v){lang=langs.includes(v)?v:'en';$('lang').value=lang;try{localStorage.setItem('trixovel-language',lang)}catch{}render()}
$('lang').addEventListener('change',()=>setLang($('lang').value));
try{setLang(localStorage.getItem('trixovel-language')||'en')}catch{setLang('en')}
let client;
async function verifiedAdmin(){
 const {data,error}=await client.auth.getUser();const u=data?.user;
 if(error||!u||!u.email_confirmed_at||u.is_anonymous)return null;
 const res=await client.from('users').select('role,status').eq('auth_user_id',u.id).maybeSingle();
 if(res.error||res.data?.role!=='admin'||res.data.status!=='active')return null;
 const again=await client.auth.getUser();return !again.error&&again.data?.user?.id===u.id?u.id:null;
}
async function load(){
 const current=++g;rows=[];status='closed';render();if(!GROWTH_OPEN)return;
 try{
  const id=await verifiedAdmin();if(current!==g)return;if(!id){status='denied';render();return}
  const day=new Date();day.setDate(day.getDate()-29);const start=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(day);
  const data=[];
  for(let offset=0;offset<1350;offset+=250){
   const page=await client.from('cardora_growth_counts').select('day_myt,source,event,hits').gte('day_myt',start).order('day_myt',{ascending:false}).order('source').order('event').range(offset,Math.min(offset+249,1349));
   if(current!==g)return;
   if(page.error||!Array.isArray(page.data))throw Error('unavailable');
   data.push(...page.data);if(page.data.length<250)break;
  }
  const again=await verifiedAdmin();if(current!==g)return;if(again!==id||!Array.isArray(data))throw Error('unavailable');
  rows=data;status=rows.length?'':'empty';render();if(rows.length)$('status').textContent='';
 }catch{if(current===g){rows=[];status='unavailable';render()}}
}
$('reload').addEventListener('click',load);
if(GROWTH_OPEN&&window.supabase){client=window.supabase.createClient('https://fdkfquvzbswxocyrhduk.supabase.co','sb_publishable_V99GEROTQ492-d_w2QIoGg_RWx8DqwT',{auth:{storageKey:'cardora-member-v1',flowType:'pkce',persistSession:true,autoRefreshToken:true}});client.auth.onAuthStateChange((event)=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event)){g++;rows=[];render();setTimeout(load,0)}})}
load();
})();
