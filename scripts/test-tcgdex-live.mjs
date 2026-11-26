import assert from 'node:assert/strict';
const url=new URL('https://api.tcgdex.net/v2/en/cards');
url.searchParams.set('name','Pikachu');
url.searchParams.set('pagination:page','1');
url.searchParams.set('pagination:itemsPerPage','2');
const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error',headers:{Origin:'https://cardora-rose.vercel.app',Accept:'application/json'}});
assert.equal(response.ok,true,'TCGdex live endpoint must respond');
assert.ok(['*','https://cardora-rose.vercel.app'].includes(response.headers.get('access-control-allow-origin')),'Browser CORS must permit production');
const rows=await response.json();
assert.ok(Array.isArray(rows)&&rows.length>0&&rows.length<=2,'Expected bounded nonempty page');
for(const row of rows){assert.match(row.id,/^[A-Za-z0-9_-]{1,100}$/);assert.equal(typeof row.localId,'string');assert.match(row.name,/Pikachu/i);}
console.log('PASS: public TCGdex response, pagination and production-origin CORS');
