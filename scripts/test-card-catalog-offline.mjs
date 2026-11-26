import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync('collection-preview.html','utf8');
const elements=new Map();
function node(){return {textContent:'',disabled:false,setAttribute(){},addEventListener(){},replaceChildren(){},append(){}}}
const document={documentElement:{},querySelectorAll:()=>[],getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id)},createElement:node};
const storage=new Map();let stored=null;const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{storage.set(k,v);stored=v}};
const context=vm.createContext({document,localStorage,URL,AbortController,setTimeout,clearTimeout,fetch:()=>{throw Error('offline')}});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
assert.equal(vm.runInContext("buildURL({name:'Pikachu ex',number:'054'},1).searchParams.get('localId')",context),'eq:054');
assert.equal(vm.runInContext("buildURL({name:'Pikachu ex',number:''},2).searchParams.get('pagination:itemsPerPage')",context),'20');
assert.equal(vm.runInContext("cardRecord({id:'<script>',name:'x',localId:'1'})",context),null);
assert.equal(vm.runInContext("cardRecord({id:'base1-4',name:'Charizard',localId:'4'}).name",context),'Charizard');
assert.equal(vm.runInContext("persist([{id:'base1-4',name:'Charizard',localId:'4'}])",context),true);
assert.equal(JSON.parse(stored).length,1);
assert.match(html,/connect-src https:\/\/api\.tcgdex\.net/);assert.doesNotMatch(html,/innerHTML|service_role|sb_secret_/);
for(const url of ['https://www.cgccards.com/CERTLOOKUP/','https://www.psacard.com/cert/','https://www.beckett.com/grading/card-lookup?flag=1','https://taggrading.com/pages/cert-search'])assert.ok(html.includes('href="'+url+'" target="_blank" rel="noopener noreferrer"'));
const cert=vm.runInContext("certRecord({company:'CGC',number:'0001234567',card:'Example card',grade:'10'})",context);
assert.equal(cert.number,'0001234567');
assert.equal(vm.runInContext("certRecord({company:'FAKE',number:'123',card:'Example',grade:'10'})",context),null);
assert.equal(vm.runInContext("certRecord({company:'TAG',number:'https://example.com',card:'Example',grade:'10'})",context),null);
assert.equal(vm.runInContext("saveCertNotes([{company:'CGC',number:'0001234567',card:'Example card',grade:'10'}])",context),true);
assert.ok(storage.has('cardora-catalog-local-preview-v1'));assert.ok(storage.has('cardora-graded-local-preview-v1'));assert.equal(storage.size,3);
assert.match(html,/用户填写，未经核验/);
console.log('Card catalog and certificate notes offline checks passed');

vm.runInContext("setLanguage('ms')",context);assert.equal(document.documentElement.lang,'ms');assert.equal(vm.runInContext("tr('加入本机收藏')",context),'Tambah ke koleksi');vm.runInContext("setLanguage('en')",context);assert.equal(vm.runInContext("tr('加入本机收藏')",context),'Add to collection');assert.equal(vm.runInContext("collection.length",context),1);assert.equal(vm.runInContext("certNotes.length",context),1);for(const file of ['join.html','collection-preview.html','packs-live-preview.html']){const source=fs.readFileSync(file,'utf8').split('<script')[0];assert.doesNotMatch(source.replace('>中文<','><'),/>[^<>]*[\u3400-\u9fff][^<>]*</u,file+' English default should not mix Chinese');assert.match(source,/id="langMs"/);}console.log('PASS: English-only default and Malay catalog without losing local records');
