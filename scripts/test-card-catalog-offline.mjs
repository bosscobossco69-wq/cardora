import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync('collection-preview.html','utf8');
const elements=new Map();
function node(){return {textContent:'',disabled:false,addEventListener(){},replaceChildren(){},append(){}}}
const document={getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id)},createElement:node};
let stored=null;const localStorage={getItem:()=>stored,setItem:(k,v)=>{stored=v}};
const context=vm.createContext({document,localStorage,URL,AbortController,setTimeout,clearTimeout,fetch:()=>{throw Error('offline')}});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
assert.equal(vm.runInContext("buildURL({name:'Pikachu ex',number:'054'},1).searchParams.get('localId')",context),'eq:054');
assert.equal(vm.runInContext("buildURL({name:'Pikachu ex',number:''},2).searchParams.get('pagination:itemsPerPage')",context),'20');
assert.equal(vm.runInContext("cardRecord({id:'<script>',name:'x',localId:'1'})",context),null);
assert.equal(vm.runInContext("cardRecord({id:'base1-4',name:'Charizard',localId:'4'}).name",context),'Charizard');
assert.equal(vm.runInContext("persist([{id:'base1-4',name:'Charizard',localId:'4'}])",context),true);
assert.equal(JSON.parse(stored).length,1);
assert.match(html,/connect-src https:\/\/api\.tcgdex\.net/);assert.doesNotMatch(html,/innerHTML|service_role|sb_secret_/);
console.log('Card catalog offline checks passed');
