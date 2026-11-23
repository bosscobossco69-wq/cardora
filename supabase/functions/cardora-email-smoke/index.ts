// DRAFT ONLY — isolated Cardora Resend deliverability diagnostic.
// NOT connected to checkout, invoices, sellers or Live billing.
// Disabled by default. Deployment and secret configuration require a separate staging review.
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  if(Deno.env.get("CARDORA_EMAIL_SMOKE_ENABLED")!=="true")return json({error:"EMAIL_TEST_DISABLED"},503);
  if(Deno.env.get("CARDORA_AUTH_MIGRATION_VERIFIED")!=="true")return json({error:"AUTH_ALIGNMENT_REQUIRED"},503);
  const token=Deno.env.get("CARDORA_EMAIL_TEST_TOKEN")||"";
  const provided=req.headers.get("x-cardora-test-token")||"";
  if(token.length<32||provided.length!==token.length)return json({error:"UNAUTHORIZED"},401);
  const a=new TextEncoder().encode(token),b=new TextEncoder().encode(provided);
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  if(diff!==0)return json({error:"UNAUTHORIZED"},401);
  const apiKey=Deno.env.get("RESEND_API_KEY")||"";
  const from=Deno.env.get("CARDORA_FROM_EMAIL")||"";
  const to=Deno.env.get("CARDORA_ADMIN_EMAIL")||"";
  if(!apiKey.startsWith("re_")||!from||!to||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
    return json({error:"EMAIL_SMOKE_NOT_CONFIGURED"},503);
  const res=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{"authorization":`Bearer ${apiKey}`,"content-type":"application/json"},
    body:JSON.stringify({
      from,to:[to],subject:"Cardora Sandbox — email delivery test",
      text:"This is an isolated Cardora email delivery test. It is not a payment receipt or membership confirmation."
    })
  });
  if(!res.ok){console.error("CARDORA_EMAIL_SMOKE_FAILED",res.status);return json({error:"EMAIL_DELIVERY_REQUEST_FAILED"},502);}
  const result=await res.json().catch(()=>({}));
  // API acceptance alone does not prove arrival at the recipient's inbox.
  return json({accepted:true,message_id:typeof result.id==="string"?result.id:null});
});
