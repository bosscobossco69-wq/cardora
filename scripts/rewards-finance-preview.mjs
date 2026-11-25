// Offline policy model only. Not an authority to issue points, charge, transfer or pay out.
// All monetary values are integer MYR sen. No external calls, balances or wallet updates.
const rules=Object.freeze({email_verified:100,profile_completed:100,first_eligible_purchase:200,first_genuine_review:100});
export function welcomePreview(events){
  if(!Array.isArray(events))throw new TypeError('events');
  const seen=new Set();
  for(const event of events){
    if(!event||event.eligible!==true||!Object.hasOwn(rules,event.kind))continue;
    seen.add(event.kind);
  }
  return {potentialCP:[...seen].reduce((n,k)=>n+rules[k],0),maxCP:500,redeemableNowCP:0,active:false};
}
function amount(n){if(!Number.isSafeInteger(n)||n<0||n>1_000_000_000_000)throw new RangeError('invalid MYR sen');return BigInt(n);}
export function commissionPreview({itemSen,processingSen,otherCostSen=0,eligible=false,settled=false,reversed=false,referrerVerified=false}){
  const item=amount(itemSen),processing=amount(processingSen),cost=amount(otherCostSen);
  // Proposed 5% seller fee and 20% of positive net contribution, NOT adopted policy.
  const gross=item*5n/100n,net=gross-processing-cost;
  const potential=(eligible===true&&settled===true&&reversed===false&&referrerVerified===true&&net>0n)?net*20n/100n:0n;
  return {currency:'MYR',grossFeeSen:Number(gross),netContributionSen:Number(net),potentialReferralSen:Number(potential),payableSen:0,active:false};
}
