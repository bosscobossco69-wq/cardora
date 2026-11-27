import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('card-world.js','utf8'),home=fs.readFileSync('index.html','utf8');
assert.deepEqual([...home.matchAll(/<a class="world-link" href="([^"]+)"/g)].map(m=>m[1]),['/collection-preview.html#search','/one-piece.html','/yugioh.html']);
for(const f of ['collection-preview.html','one-piece.html','yugioh.html']){
 const html=fs.readFileSync(f,'utf8');for(const link of ['/collection-preview.html#search','/one-piece.html','/yugioh.html','/global-launch.html?kind=seller#application','/global-launch.html?kind=partner#application'])assert.ok(html.includes('href="'+link+'"'),f+' '+link);
 assert.match(html,/noindex,nofollow/);assert.match(html,/img-src 'self'/);
}
assert.match(fs.readFileSync('one-piece.html','utf8'),/connect-src https:\/\/optcgapi\.com/);
assert.match(fs.readFileSync('yugioh.html','utf8'),/connect-src https:\/\/db\.ygoprodeck\.com/);
assert.doesNotMatch(source,/innerHTML|service_role|sb_secret_|card_images|card_prices|auth\.getUser/);
const store=new Map(),calls=[];
function fixture(game,{fail=false,broken=false}={}){
 const nodes=new Map(),mk=()=>({children:[],events:{},dataset:{},value:'',hidden:false,textContent:'',disabled:false,append(...x){this.children.push(...x)},replaceChildren(){this.children=[]},addEventListener(k,fn){this.events[k]=fn}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,mk());return nodes.get(id)};
 const labels=[...fs.readFileSync(game+'.html','utf8').matchAll(/data-t="([^"]+)"/g)].map(m=>({dataset:{t:m[1]},textContent:''}));
 const document={body:{dataset:{game}},documentElement:{},getElementById:node,createElement:mk,querySelectorAll:()=>labels};
 const localStorage={getItem:k=>store.get(k)||null,setItem(k,v){if(broken&&k.startsWith('trixovel-world-local-v1:'))throw Error('quota');store.set(k,v)}};
 const fetch=async(url,opt)=>{calls.push({url:String(url),opt});if(fail)throw Error('offline');if(game==='one-piece')return{ok:true,json:async()=>[{card_set_id:'OP01-001',card_name:'Roronoa Zoro (001)'},{card_set_id:'OP99-999',card_name:'Wrong card'}]};return{ok:true,json:async()=>({data:[{id:46986414,name:'Dark Magician',desc:'ignored',card_images:[{image_url:'https://invalid.example'}],card_prices:[{price:'123'}]}]})}};
 vm.runInNewContext(source,{document,localStorage,fetch,URL,AbortController,setTimeout,clearTimeout,Date});
 const submit=id=>node(id).events.submit({preventDefault(){}}),settle=()=>new Promise(r=>setImmediate(r));
 return {node,labels,document,async search(q){node('query').value=q;submit('searchForm');await settle()},manual(n,num,v=''){node('manualName').value=n;node('manualNumber').value=num;node('manualVariant').value=v;submit('manualForm')},language(l){node('language').value=l;node('language').events.change()},addFirst(){node('results').children[0].children.at(-1).events.click()},removeFirst(){node('savedRows').children[0].children.at(-1).events.click()}};
}
const op=fixture('one-piece');await op.search('Nami');assert.equal(op.node('results').children.length,1);assert.equal(op.node('results').children[0].children[1].textContent,'Nami');assert.equal(calls.length,0);op.addFirst();op.addFirst();assert.equal(op.node('savedRows').children.length,1);op.manual('My card','OP01-016','Parallel');assert.equal(op.node('savedRows').children.length,2);
const reload=fixture('one-piece');assert.equal(reload.node('savedRows').children.length,2);reload.removeFirst();assert.equal(reload.node('savedRows').children.length,1);await reload.search('OP01-001');assert.equal(reload.node('results').children[0].children[1].textContent,'Roronoa Zoro');
assert.equal(calls.length,1);assert.equal(calls[0].url,'https://optcgapi.com/api/sets/card/OP01-001/');assert.equal(reload.node('results').children.length,1);await reload.search('op01-001');assert.equal(calls.length,1,'OP cached repeat');const opOffline=fixture('one-piece',{fail:true});await opOffline.search('OP01-016');assert.equal(opOffline.node('results').children[0].children[1].textContent,'Nami');assert.match(opOffline.node('status').textContent,/unavailable/);calls.length=0;
const ygo=fixture('yugioh');assert.equal(ygo.node('savedRows').children.length,0);await ygo.search('Dark Magician');assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).searchParams.get('fname'),'Dark Magician');assert.equal(calls[0].opt.credentials,'omit');assert.equal(calls[0].opt.referrerPolicy,'no-referrer');ygo.addFirst();assert.equal(ygo.node('savedRows').children.length,1);assert.equal(JSON.parse(store.get('trixovel-world-local-v1:yugioh'))[0].number,'46986414');await ygo.search('Dark Magician');assert.equal(calls.length,1,'cached repeat');await ygo.search('person@example.invalid');assert.equal(calls.length,1,'invalid query blocked');assert.equal(ygo.node('status').textContent,'Enter a valid English name or card number.');
const off=fixture('yugioh',{fail:true});await off.search('89631139');assert.equal(off.node('results').children[0].children[1].textContent,'Blue-Eyes White Dragon');assert.match(off.node('status').textContent,/unavailable/);
for(const l of ['en','zh','ms','th']){off.language(l);assert.equal(off.document.documentElement.lang,l==='zh'?'zh-Hans':l);assert.ok(off.labels.every(x=>x.textContent&&x.textContent!==x.dataset.t))}
const bad=fixture('one-piece',{broken:true});bad.manual('New','TEST-1');assert.equal(bad.node('savedRows').children.length,1);bad.language('en');assert.match(bad.node('savedStatus').textContent,/storage unavailable/);
console.log('PASS: internal category navigation, OP reference name/number lookup, local variant notes, persistence/removal, game isolation, YGO bounded request/cache/fallback, four languages and storage failure');
