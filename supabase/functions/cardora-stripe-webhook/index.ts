// Stripe webhook draft — VERIFIED EVENTS ONLY. Deploy with verify_jwt=false.
// STRIPE_SECRET_KEY must begin sk_test_; STRIPE_WEBHOOK_SECRET must be the webhook's whsec_.
// Requires the draft SQL migration applied to the SAME Cardora Auth+DB project.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
Deno.serve(async(req)=>{
  if(req.method!=="POST") return response({error:"METHOD_NOT_ALLOWED"},405);
  if(Deno.env.get("CARDORA_AUTH_MIGRATION_VERIFIED")!=="true") return response({error:"AUTH_MIGRATION_NOT_VERIFIED"},503);
  const key=Deno.env.get("STRIPE_SECRET_KEY")||"";
  const whsec=Deno.env.get("STRIPE_WEBHOOK_SECRET")||"";
  const url=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!key.startsWith("sk_test_")||!whsec.startsWith("whsec_")||!url||!serviceKey) return response({error:"SANDBOX_NOT_CONFIGURED"},503);
  const signature=req.headers.get("stripe-signature");
  if(!signature) return response({error:"MISSING_SIGNATURE"},400);
  const stripe=new Stripe(key);
  let event:Stripe.Event;
  try {
    const raw=await req.text();
    event=await stripe.webhooks.constructEventAsync(raw,signature,whsec,undefined,Stripe.createSubtleCryptoProvider());
  } catch {return response({error:"INVALID_SIGNATURE"},400);}
  if(!["checkout.session.completed","invoice.paid","invoice.payment_failed","customer.subscription.deleted"].includes(event.type))
    return response({received:true,ignored:true});
  try {
    let subscriptionId="";
    if(event.type==="checkout.session.completed") {
      const session=event.data.object as Stripe.Checkout.Session;
      if(session.mode!=="subscription" || session.payment_status!=="paid") return response({received:true,pending:true});
      subscriptionId=typeof session.subscription==="string"?session.subscription:session.subscription?.id||"";
    } else if(event.type==="customer.subscription.deleted") {
      subscriptionId=(event.data.object as Stripe.Subscription).id;
    } else {
      const invoice=event.data.object as Stripe.Invoice & {parent?:{subscription_details?:{subscription?:string|{id:string}}},subscription?:string|{id:string}};
      const parentSub=invoice.parent?.subscription_details?.subscription;
      const sub=parentSub || invoice.subscription;
      subscriptionId=typeof sub==="string"?sub:sub?.id||"";
    }
    if(!subscriptionId) return response({error:"SUBSCRIPTION_ID_MISSING"},422);
    const subscription=await stripe.subscriptions.retrieve(subscriptionId);
    // Do not reactivate a subscription Stripe currently considers canceled/incomplete.
    if(event.type==="invoice.paid" && !["active","trialing"].includes(subscription.status))
      return response({received:true,ignored_stale_invoice:true});
    // An older failed invoice cannot downgrade a subscription now recovered to active.
    if(event.type==="invoice.payment_failed" && !["past_due","unpaid","incomplete"].includes(subscription.status))
      return response({received:true,ignored_stale_failure:true});
    const sellerId=subscription.metadata?.seller_profile_id || "";
    const tier=subscription.metadata?.tier || "";
    // Exact Checkout reservation ID is Stripe-owned subscription metadata, never request JSON.
    const checkoutRequestId=subscription.metadata?.checkout_request_id || "";
    const validReservationId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkoutRequestId);
    if(event.type==="invoice.paid" && !validReservationId)
      return response({error:"MISSING_CHECKOUT_RESERVATION"},422);
    const expectedPrice:Record<string,string>={
      basic:Deno.env.get("STRIPE_PRICE_BASIC")||"",
      pro:Deno.env.get("STRIPE_PRICE_PRO")||"",
      business:Deno.env.get("STRIPE_PRICE_BUSINESS")||""
    };
    const dbPlanCode:Record<string,string>={
      basic:Deno.env.get("STRIPE_DB_PLAN_BASIC")||"",
      pro:Deno.env.get("STRIPE_DB_PLAN_PRO")||"",
      business:Deno.env.get("STRIPE_DB_PLAN_BUSINESS")||""
    };
    if(subscription.metadata?.project!=="cardora"||!sellerId||!expectedPrice[tier]||!dbPlanCode[tier]||
      !subscription.items.data.some(item=>item.price.id===expectedPrice[tier]) ) return response({error:"UNRECOGNIZED_SUBSCRIPTION"},422);
    // Only invoice.paid confirms recurring payments. Checkout completion is NOT fulfillment.
    if(event.type==="checkout.session.completed") return response({received:true,awaiting_invoice:true});
    const kind=event.type==="invoice.paid"?"paid":event.type==="invoice.payment_failed"?"past_due":"canceled";
    const item=subscription.items.data.find(i=>i.price.id===expectedPrice[tier]);
    // Period dates must come from authoritative Stripe objects, not browser input.
    const periodStart=item?.current_period_start ? new Date(item.current_period_start*1000).toISOString():null;
    const periodEnd=item?.current_period_end ? new Date(item.current_period_end*1000).toISOString():null;
    if(kind==="paid"&&(!periodStart||!periodEnd)) return response({error:"PERIOD_NOT_VERIFIED"},422);
    const customerId=typeof subscription.customer==="string"?subscription.customer:subscription.customer.id;
    const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {error}=await db.rpc("cardora_apply_verified_stripe_event",{
      p_event_id:event.id,p_kind:kind,p_seller_profile_id:sellerId,p_plan_code:dbPlanCode[tier],
      p_stripe_customer_id:customerId,p_stripe_subscription_id:subscriptionId,
      p_period_start:periodStart,p_period_end:periodEnd,
      p_checkout_request_id:validReservationId?checkoutRequestId:null
    });
    if(error){console.error("STRIPE_EVENT_APPLY_FAILED",error.code);return response({error:"EVENT_PERSIST_FAILED"},500);}
    return response({received:true});
  } catch(e) {
    console.error("STRIPE_EVENT_ERROR",e instanceof Error?e.message:"unknown");
    return response({error:"EVENT_PROCESSING_FAILED"},500);
  }
});
