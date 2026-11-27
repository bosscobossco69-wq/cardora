import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const home=fs.readFileSync('index.html','utf8'),join=fs.readFileSync('join.html','utf8'),src=fs.readFileSync('growth-events.js','utf8'),admin=fs.readFileSync('growth-admin.js','utf8');
for(const x of ['Pokémon TCG','One Piece Card Game','Yu-Gi-Oh!','/join.html?mode=register','?kind=seller','?kind=partner','cardora_community_snapshot','growth-events.js'])assert.ok(home.includes(x),x);
assert.equal((home.match(/class="world"/g)||[]).length,3);
assert.match(home,/canonical" href="https:\/\/trixovel\.com\/"/);
for(const p of ['mode','signup_submit','signup_response_ok','signup_failed','email_verified','member-profile.js'])assert.ok(join.includes(p),p);
assert.match(src,/const GROWTH_OPEN=(?:true|false)/);assert.match(admin,/const GROWTH_OPEN=(?:true|false)/);
assert.doesNotMatch(src,/\bservice_role\b|sb_secret_|\.cookie\b|\.value\b|auth\.getUser/);
function fixture(enabled=false){
 const sent=[],ls=new Map(),ss=new Map(),window={};
 const mk=()=>({children:[],append(x){this.children.push(x)},replaceChildren(){this.children=[]}});
 const root=mk(),store=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)});
 const document={referrer:'https://www.facebook.com/private-path',getElementById:()=>root,createElement:mk,addEventListener(){}};
 vm.runInNewContext(src.replace(/const GROWTH_OPEN=(?:true|false)/,'const GROWTH_OPEN='+enabled),{window,document,location:{pathname:'/',search:'?utm_source=facebook&private=secret',hostname:'example.invalid'},navigator:{},URL,URLSearchParams,Intl,Date,localStorage:store(ls),sessionStorage:store(ss),fetch:(url,opt)=>{sent.push(JSON.parse(opt.body));return Promise.resolve({ok:true})},setTimeout:fn=>fn()});
 return {sent,window,root,ls};
}
const off=fixture();off.ls.set('trixovel-growth-consent','yes');off.window.TRXGrowth.record('page_home');assert.equal(off.sent.length,0);
const on=fixture(true);assert.equal(on.sent.length,0);on.window.TRXGrowth.record('signup_submit');assert.equal(on.sent.length,0);
on.root.children[2].onclick();assert.equal(on.sent.length,1);assert.deepEqual(on.sent[0],{p_event:'page_home',p_source:'facebook'});
on.window.TRXGrowth.record('signup_submit');on.window.TRXGrowth.record('signup_submit');on.window.TRXGrowth.record('private@email.invalid');assert.equal(on.sent.length,2);assert.deepEqual(on.sent[1],{p_event:'signup_submit',p_source:'facebook'});
on.root.children[2].onclick();on.window.TRXGrowth.record('signup_failed');assert.equal(on.sent.length,2);
console.log('PASS: collector-first homepage, opt-in only, gate closed, enum payload, session dedup, no PII, consent withdrawal');
