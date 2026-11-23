#!/usr/bin/env node
// Strictly preview-only read-only admin entrypoint, never an alternative production storefront.
// Auth-only requests: existing-user Email OTP/password and signOut;
// data read only through admin-verified cardora-admin-overview Edge Function. No application/order/payment mutation actions.
import {mkdirSync,writeFileSync} from 'node:fs';
const fail=(m)=>{console.error('CARDORA PREVIEW BLOCKED:',m);process.exit(1)};
const previewEnv=process.env.VERCEL_ENV||'';
const previewBranch=process.env.VERCEL_GIT_COMMIT_REF||'';
if(process.env.CARDORA_PREVIEW_BUILD!=='YES')fail('explicit opt-in missing');
if(previewEnv!=='preview')fail('not in Vercel preview environment');
if(previewBranch!=='draft/stripe-sandbox-subscriptions-20261121')fail('wrong Git branch');
const url=(process.env.CARDORA_PREVIEW_SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.CARDORA_PREVIEW_SUPABASE_PUBLISHABLE_KEY||'';
if(url!=='https://fdkfquvzbswxocyrhduk.supabase.co')fail('wrong Supabase project');
if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))fail('public key required');
if(/service_role|sb_secret_|sk_live_|sk_test_/i.test(key))fail('secret refused');
const csp="default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self' "+url+"; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const data={url,key};
const html=`<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Cardora 管理后台｜只读预览</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0e1020;color:#f6f4ff;font:15px/1.65 system-ui,-apple-system,sans-serif}
main{max-width:830px;margin:auto;padding:28px 16px 75px}h1{font-size:clamp(24px,5vw,34px)}h2{font-size:19px;margin-top:24px}
p,.muted{color:#b6b3ce}.warning{border:1px solid #a7893b;background:#292315;border-radius:12px;padding:13px;color:#ffe7ac}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}
.card{border:1px solid #35334f;background:#191a2d;padding:16px;border-radius:12px}.value{font-size:29px;font-weight:800}
form{display:grid;gap:10px;max-width:460px}label{display:grid;gap:5px}input{background:#131527;border:1px solid #57516e;color:white;border-radius:10px;padding:12px;font:inherit;width:100%}
button{background:#e7c56f;border:0;border-radius:10px;padding:12px 18px;color:#17121a;font-weight:700;cursor:pointer}
button.secondary{background:#39354e;color:white}button:disabled{opacity:.5}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center}
article{border:1px solid #35334f;border-radius:12px;padding:12px 14px;margin:10px 0;overflow-wrap:anywhere}
a{color:#e9c775}small{color:#b6b3ce}
</style></head>
<body><main>
<h1>Cardora · 统一管理后台</h1>
<div class="warning"><strong>受保护的只读测试版</strong>：本页面连接新 Cardora 身份系统，不接受新注册、申请审核、订单操作、资金转账或 Stripe 支付。旧项目历史数据仅在已授权的管理员接口可用后单独展示。</div>
<p id="loginState" role="status" aria-live="polite">正在检查登录状态……</p>
<section id="authSection">
<h2>管理员邮箱验证码登录</h2>
<form id="emailOtpForm"><label>已有 Cardora 管理员邮箱<input id="otpEmail" autocomplete="email" type="email" required></label>
<button id="sendOtpButton" type="submit">发送邮箱验证码（不会创建用户）</button></form>
<form id="verifyOtpForm" hidden><label>邮件中的验证码<input id="otpToken" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required></label>
<button id="verifyOtpButton" type="submit">验证并登录</button></form>
<p class="muted">只接受新 Cardora 项目中已经存在的账号。邮件如提供登录链接，请使用发送验证码时的同一浏览器打开；需事先配置该 Preview 的允许跳转地址。若新项目尚未配置邮件模板或发信服务，验证码可能无法送达。</p>
<h2>备用：已有密码登录</h2>
<form id="loginForm"><label>邮箱<input id="email" autocomplete="username" type="email" required></label>
<label>密码<input id="password" autocomplete="current-password" type="password" required></label>
<button id="loginButton" type="submit">登录（不会创建新用户）</button></form>
<p class="muted">Google OAuth 尚未联调。此页面不开放新用户注册，也不会把旧项目身份自动迁移到新项目。</p>
</section>
<section id="overview" hidden><div class="row"><button id="refreshButton" type="button">刷新只读统计</button><button class="secondary" id="logoutButton" type="button">退出</button></div>
<p id="profileStatus" role="status" aria-live="polite">尚未验证 Cardora 用户资料关联。</p>\n<p id="resultStatus" role="status" aria-live="polite">正在检查管理员权限……</p>
<div class="cards" id="cards"></div><section id="customers"><h2>Customers · 客户管理（只读）</h2><p>尚未获得经管理员授权的客户名单，等待后端接口验证。</p></section><section id="applications"></section><section id="archive"></section></section>
<p style="margin-top:36px"><small>数据来源：新 Cardora Supabase。旧记录只显示为历史档案，不与新库人数直接相加。未配置接口时显示不可用，绝不展示虚构统计。</small></p>
</main><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"></script>
<script>
(function(){
 'use strict';
 const config=${JSON.stringify(data)};
 const $=(id)=>document.getElementById(id);
 const client=window.supabase.createClient(config.url,config.key,{
   auth:{storageKey:'cardora-admin-readonly-preview-v1',flowType:'pkce',autoRefreshToken:true,persistSession:true}
 });
 const text=(target,content)=>{target.textContent=String(content)};
 const create=(tag,content,parent)=>{const n=document.createElement(tag);text(n,content);parent.appendChild(n);return n};
 const showAuth=(signedIn)=>{$('authSection').hidden=signedIn;$('overview').hidden=!signedIn};
 const metric=(label,value)=>{const item=create('div','',$('cards'));item.className='card';create('div',label,item);
   const v=create('div',value,item);v.className='value'};
 const renderApps=(id,title,apps)=>{
   const root=$(id);root.replaceChildren();create('h2',title,root);
   if(!Array.isArray(apps)||!apps.length){create('p','暂无记录',root);return}
   for(const a of apps){const entry=create('article','',root);
    create('strong',(a.name||'申请人')+' · '+(a.role||'待确认'),entry);
    create('p',(a.status||'未知状态')+' · '+(a.created_at||''),entry);
    if(a.email_masked)create('p',a.email_masked,entry);
    if(a.suspected_test)create('small','疑似测试记录（需要人工核对）',entry);
   }
 };
 async function load(){
   $('cards').replaceChildren();$('customers').replaceChildren();$('applications').replaceChildren();$('archive').replaceChildren();
   text($('resultStatus'),'验证管理员权限中……');
   const {data:{session},error}=await client.auth.getSession();
   if(error||!session?.access_token){showAuth(false);text($('loginState'),'请使用新 Cardora 项目的管理员账号登录。');return}
   const verified=await client.auth.getUser();
   if(verified.error||!verified.data?.user){showAuth(false);text($('loginState'),'登录会话已失效。');return}
   showAuth(true);text($('loginState'),'已验证新 Cardora Auth 会话。');
   // Read ONLY this signed-in identity's profile, protected by users own-row RLS.
   // This browser-side check grants NO privileges. The Edge endpoint must
   // independently verify admin + active status for every request.
   text($('profileStatus'),'正在核对新 Cardora 资料关联……');
   const profileResult=await client.from('users')
     .select('id,status,role').eq('auth_user_id',verified.data.user.id).maybeSingle();
   if(profileResult.error){
     text($('profileStatus'),'账号已登录，但无法读取自身 Cardora 资料；检查新项目 users 的 RLS/授权设置。');
     text($('resultStatus'),'管理员接口尚未调用；无法验证账号资料关联。');
     return;
   }
   if(!profileResult.data){
     text($('profileStatus'),'账号已登录，但新 Cardora 数据库中没有对应资料。不能通过邮箱自动继承旧管理员权限。');
     text($('resultStatus'),'管理员接口尚未调用。');
     return;
   }
   if(profileResult.data.status!=='active'||profileResult.data.role!=='admin'){
     text($('profileStatus'),'新 Cardora 资料已找到，但账号并非有效管理员。此页面不授予管理员权限。');
     text($('resultStatus'),'仅有效管理员可以读取统计信息。');
     return;
   }
   text($('profileStatus'),'新 Cardora 登录与有效管理员资料已关联；正在请求后端独立授权。');
   // Explicitly no database writes or privileged keys in this browser.
   const {data:result,error:invokeError}=await client.functions.invoke('cardora-admin-overview',{
     method:'POST',body:{},headers:{Authorization:'Bearer '+session.access_token}
   });
   if(invokeError||!result?.counts){
     // Only classify known response statuses/error codes; never echo raw error text,
     // response bodies, bearer tokens, private emails, or server-side credentials.
     const status=invokeError?.context?.status||0;
     const code=result?.error||'';
     if(status===401||code==='LOGIN_REQUIRED'||code==='INVALID_SESSION'){
       showAuth(false);
       text($('loginState'),'会话失效或登录验证失败，请重新使用管理员账号登录。');
     }else if(status===403||code==='ADMIN_ONLY'){
       text($('resultStatus'),'没有管理员访问权限：当前账号不能查看客户名单。');
     }else if(code==='ADMIN_OVERVIEW_NOT_VERIFIED'){
       text($('resultStatus'),'只读管理接口尚未通过上线验收，安全开关仍关闭。');
     }else if(status===404){
       text($('resultStatus'),'Customers 后端接口尚未部署（404），登录成功不代表数据接口已开放。');
     }else{
       text($('resultStatus'),'Customers 数据暂时不可用（可能为接口未部署、服务器故障或配置未完成）。不会显示虚构人数。');
     }
     return;
   }
   const c=result.counts;
   for(const [label,value] of Object.entries({
     '注册资料':c.registered_profiles,'卖家资料':c.sellers,'代理资料':c.agents,
     '申请总数':c.applications,'待审申请':c.pending,'批准申请':c.approved,
     '卖家申请':c.seller_applications,'代理申请':c.agent_applications,
     '商品记录':c.listings,'订单记录':c.orders,'订阅记录':c.subscription_records
   })) metric(label,value??'—');
   const customersRoot=$('customers');
   create('h2','Customers · 客户管理（只读）',customersRoot);
   const roster=result.customers;
   if(!roster||!Array.isArray(roster.records)){
     create('p','客户名单接口尚未通过审核；不会显示虚构资料。',customersRoot);
   }else{
     create('p','新库用户资料总数：'+roster.total_profiles+'；本页最多显示 '+roster.limit+' 条（实际显示 '+roster.displayed_count+' 条）。不是已经去重的真实客户人数。',customersRoot);
     create('p','邮件回访：尚未启用；营销同意：未配置。',customersRoot);
     if(!roster.records.length)create('p','暂无可显示客户资料。',customersRoot);
     for(const u of roster.records){
       const item=create('article','',customersRoot);
       create('strong',(u.member_id||'无会员编号')+' · '+(u.role||'用户'),item);
       create('p','注册：'+(u.created_at||'未知')+' · 状态：'+(u.status||'未知'),item);
       if(u.email_masked)create('p',u.email_masked,item);
       if(u.suspected_test)create('small','疑似测试账号，需人工复核',item);
       create('small','回访：未启用 · 订阅同意：未配置',item);
     }
   }
   renderApps('applications','新 Cardora 申请（只读）',result.applications);
   const old=result.legacy_history;
   if(old?.available){
     renderApps('archive','旧项目历史申请（只读）',old.applications);
     const summary=create('p','旧项目历史申请共 '+old.record_count+' 条，独立归档，不计入新库统计。',$('archive'));
     $('archive').insertBefore(summary,$('archive').firstChild.nextSibling);
   }else create('p','旧项目历史档案尚未连接（非 0 条）。',$('archive'));
   text($('resultStatus'),'管理员读取完成 · '+(result.updated_at||''));
 }
 $('emailOtpForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=$('sendOtpButton');button.disabled=true;
  text($('loginState'),'正在请求新 Cardora 项目的登录验证码……');
  try{
    const email=$('otpEmail').value.trim();
    const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}});
    if(error)throw error;
    $('verifyOtpForm').hidden=false;
    text($('loginState'),'如果该邮箱是新 Cardora 的现有账号，请查收邮件中的验证码或登录链接。请勿向任何人提供验证码。');
  }catch(err){text($('loginState'),'验证码请求未完成。请检查新项目的邮箱登录、发信限额及允许跳转地址；不会创建新用户。')}
  finally{button.disabled=false}
 });
 $('verifyOtpForm').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('verifyOtpButton');button.disabled=true;
  text($('loginState'),'正在验证邮箱验证码……');
  try{
    const email=$('otpEmail').value.trim();
    const token=$('otpToken').value.trim();
    if(!/^[0-9]{6,12}$/.test(token))throw new Error('invalid code format');
    const {error}=await client.auth.verifyOtp({email,token,type:'email'});
    if(error)throw error;
    $('otpToken').value='';
    await load();
  }catch(err){text($('loginState'),'验证码验证失败。请确认使用新 Cardora 项目的有效验证码。')}
  finally{button.disabled=false}
 });
 $('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();$('loginButton').disabled=true;text($('loginState'),'正在验证已有账号……');
  try{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      if(error)throw error;$('password').value='';await load();
  }catch(err){text($('loginState'),'登录失败，请确认这是新 Cardora 项目中的现有账号，且启用了密码登录。')}
  finally{$('loginButton').disabled=false}
 });
 $('refreshButton').addEventListener('click',load);
 $('logoutButton').addEventListener('click',async()=>{await client.auth.signOut();showAuth(false);text($('loginState'),'已退出。')});
 load().catch(()=>{showAuth(false);text($('loginState'),'初始化失败。')});
})();
</script></body></html>`;
mkdirSync('dist-preview',{recursive:true});
writeFileSync('dist-preview/index.html',html,'utf8');
console.log('PASS: read-only Cardora preview built for correct branch; no active database write or payments.');
