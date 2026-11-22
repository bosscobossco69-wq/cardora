#!/usr/bin/env node
// Offline staging-only build of Cardora's single-file frontend.
// This script does not access Supabase, Stripe, GitHub or Vercel and never changes index.html.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const fail = (msg) => { console.error('STAGING BUILD BLOCKED: ' + msg); process.exit(1); };
if (process.env.CARDORA_STAGING_BUILD !== 'YES') fail('Explicit CARDORA_STAGING_BUILD=YES required');
const projectUrl = (process.env.CARDORA_STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = process.env.CARDORA_STAGING_SUPABASE_ANON_KEY || '';
if (projectUrl !== 'https://fdkfquvzbswxocyrhduk.supabase.co') fail('Only the known Cardora project URL is accepted');
if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(anonKey) && !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(anonKey))
  fail('Require a Supabase public anon/publishable key (never service_role or secret key)');
if (/service_role|sb_secret_/i.test(anonKey)) fail('Secret key refused');
const src = resolve('index.html');
let html = readFileSync(src, 'utf8');
const oldUrl = 'https://crqqockaetgacddxkqpb.supabase.co';
const oldProject = 'crqqockaetgacddxkqpb';
const exact = (needle, expected) => {
  const count = html.split(needle).length-1;
  if(count !== expected) fail('Expected '+expected+' occurrences of '+needle+', found '+count);
};
exact("const PTX_SUPABASE_URL='"+oldUrl+"';",1);
exact("const PTX_SUPABASE_KEY='",1);
exact("storageKey:'cardora-supabase-auth-v1'",1);
exact("connect-src 'self' "+oldUrl,1);
// The source contains the old project URL both in JS and in CSP; reject surprises.
exact(oldUrl,2);
html = html.replace("const PTX_SUPABASE_URL='"+oldUrl+"';", "const PTX_SUPABASE_URL='"+projectUrl+"';");
html = html.replace(/const PTX_SUPABASE_KEY='[^']*';/, () => "const PTX_SUPABASE_KEY='"+anonKey+"';");
html = html.replace("storageKey:'cardora-supabase-auth-v1'","storageKey:'cardora-supabase-auth-v2-staging'");
html = html.replace("connect-src 'self' "+oldUrl,"connect-src 'self' "+projectUrl);
// Staging-only admin compatibility adapter. Keep production index.html unchanged.
// The public table has own-row RLS and cannot serve the admin review queue.
// Never broaden table RLS: use an admin-role checked SECURITY DEFINER RPC.
const oldQueue = `const r=await window.ptxSupabase.from('seller_applications')
     .select('id,created_at,name,email,whatsapp,city,role,shop_links,card_count,categories,monthly_volume,message,status')
     .order('created_at',{ascending:false}).limit(100);`;
const newQueue = `const r=await window.ptxSupabase.rpc('admin_get_seller_application_queue',{p_limit:100});`;
exact(oldQueue,1);
html=html.replace(oldQueue,newQueue);
const oldReview = `const r=await window.ptxSupabase.from('seller_applications').update({status:status}).eq('id',id).select('id');
   if(r.error)throw r.error;
   if(!r.data||!r.data.length)throw new Error('no row updated');`;
const newReview = `const r=await window.ptxSupabase.rpc('admin_review_seller_application',{p_application_id:id,p_status:status,p_note:null});
   if(r.error)throw r.error;
   if(r.data!==true)throw new Error('review not confirmed');`;
exact(oldReview,1);
html=html.replace(oldReview,newReview);
// Block preview functionality until separate testing of privilege-sensitive flows.
const oldReviewRpc=`rpc('admin_review_seller_application'`;
if(!html.includes(oldReviewRpc) || !html.includes("rpc('admin_get_seller_application_queue'"))
  fail('Admin RPC staging adapter missing');
// Extra guard: must not silently leave a backend pointed at legacy database.
if(html.includes(oldProject)) fail('Legacy project reference remains in staging build; inspect source manually');
if(!html.includes("connect-src 'self' "+projectUrl)) fail('Staging CSP not applied');
const out = resolve('dist-staging/index.html');
mkdirSync(resolve('dist-staging'),{recursive:true});
writeFileSync(out,html,{encoding:'utf8',flag:'w'});
console.log('Staging-only frontend created at dist-staging/index.html; do not publish until OAuth/RLS tests pass.');
