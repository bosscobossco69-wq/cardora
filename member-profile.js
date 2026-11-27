/* Private profile editor. Never use localStorage or user metadata for profile authorization. */
(function(root){
'use strict';
const TABLE='cardora_member_details',FIELDS='owner_id,nickname,region,bio,avatar';
const avatars=Object.freeze({star:'★',moon:'☾',sun:'☀',leaf:'❧',gem:'◇',card:'♠'});
const labels={
 loading:['Loading profile…','正在读取个人资料…','Memuatkan profil…','กำลังโหลดโปรไฟล์…'],
 ready:['Your profile is private.','个人资料仅自己可见。','Profil anda adalah peribadi.','โปรไฟล์ของคุณเป็นส่วนตัว'],
 unavailable:['Profile editing is not available. Retry later.','个人资料编辑暂不可用，请稍后重试。','Penyuntingan profil belum tersedia. Cuba lagi nanti.','ยังแก้ไขโปรไฟล์ไม่ได้ โปรดลองใหม่ภายหลัง'],
 saving:['Saving…','正在保存…','Menyimpan…','กำลังบันทึก…'],
 saved:['Profile saved.','个人资料已保存。','Profil disimpan.','บันทึกโปรไฟล์แล้ว'],
 failed:['Save not confirmed. Retry loading before saving again.','尚未确认保存成功，请重新读取后再保存。','Simpanan belum disahkan. Muat semula sebelum menyimpan.','ยังไม่ยืนยันการบันทึก โปรดโหลดใหม่ก่อนบันทึกอีกครั้ง'],
 invalid:['Check the field lengths. Do not enter control characters.','请检查文字长度，不要输入控制字符。','Semak panjang medan. Jangan masukkan aksara kawalan.','ตรวจสอบความยาว ห้ามใส่อักขระควบคุม']
};
const defaults=()=>({nickname:'',region:'',bio:'',avatar:'star'});
const clean=(value,max)=>typeof value==='string'&&Array.from(value).length<=max&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);
function validate(v){return v&&clean(v.nickname,40)&&(v.nickname===''||Array.from(v.nickname.trim()).length>=2)&&clean(v.region,60)&&clean(v.bio,240)&&Object.hasOwn(avatars,v.avatar);}
root.TRXMemberProfile=function({client,document,verify,timeout}){
 const $=id=>document.getElementById(id);
 let owner=null,generation=0,busy=false,loaded=false,exists=false,language='en',status='';
 const inputs=['profileNickname','profileRegion','profileBio','profileAvatar'];
 function setStatus(key){status=key;$('profileEditStatus').textContent=labels[key]?.[['en','zh','ms','th'].indexOf(language)]||'';}
 function enabled(){for(const id of inputs)$(id).disabled=!loaded||busy;$('profileSave').disabled=!loaded||busy;$('profileReload').disabled=!owner||busy;}
 function showAvatar(){const v=$('profileAvatar').value;$('profileAvatarGlyph').textContent=Object.hasOwn(avatars,v)?avatars[v]:avatars.star;}
 function fill(v){$('profileNickname').value=v.nickname;$('profileRegion').value=v.region;$('profileBio').value=v.bio;$('profileAvatar').value=v.avatar;showAvatar();}
 function clear(){generation++;owner=null;busy=false;loaded=false;exists=false;$('profileEditor').hidden=true;fill(defaults());setStatus('');enabled();}
 function current(id,g){return owner===id&&generation===g;}
 async function verified(id){const u=await timeout(verify());return !!u&&u.id===id&&!u.is_anonymous&&!!u.email_confirmed_at;}
 async function load(id){
  clear();owner=id;const g=generation;busy=true;$('profileEditor').hidden=false;setStatus('loading');enabled();
  try{
   if(!await verified(id)||!current(id,g))throw Error('identity');
   const {data,error}=await timeout(client.from(TABLE).select(FIELDS).eq('owner_id',id).maybeSingle());
   if(!current(id,g))return;
   if(error||(data&&(data.owner_id!==id||!validate(data))))throw Error('read');
   if(!await verified(id)||!current(id,g))throw Error('identity');
   exists=!!data;fill(data||defaults());loaded=true;setStatus('ready');
  }catch{if(current(id,g)){loaded=false;fill(defaults());setStatus('unavailable');}}
  finally{if(current(id,g)){busy=false;enabled();}}
 }
 async function save(event){
  event.preventDefault();if(!loaded||busy||!owner)return;
  const id=owner,g=generation,v={nickname:$('profileNickname').value.trim(),region:$('profileRegion').value.trim(),bio:$('profileBio').value.trim(),avatar:$('profileAvatar').value};
  if(!validate(v)){setStatus('invalid');return;}
  busy=true;setStatus('saving');enabled();
  try{
   if(!await verified(id)||!current(id,g))throw Error('identity');
   const table=client.from(TABLE);
   const query=exists?table.update(v).eq('owner_id',id):table.insert({owner_id:id,...v});
   const {data,error}=await timeout(query.select(FIELDS).single());
   if(!current(id,g))return;
   if(error||!data||data.owner_id!==id||!validate(data)||!await verified(id)||!current(id,g))throw Error('write');
   exists=true;fill(data);setStatus('saved');
  }catch{if(current(id,g)){loaded=false;setStatus('failed');}}
  finally{if(current(id,g)){busy=false;enabled();}}
 }
 $('profileForm').addEventListener('submit',save);
 $('profileAvatar').addEventListener('change',showAvatar);
 $('profileReload').addEventListener('click',()=>{if(owner&&!busy)return load(owner);});
 clear();
 return {open:load,clear,setLanguage(v){language=['en','zh','ms','th'].includes(v)?v:'en';setStatus(status);}};
};
})(window);
