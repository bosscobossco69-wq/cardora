import assert from 'node:assert/strict';import {readFileSync as read} from 'node:fs';
const join=read('join.html','utf8'),rules=read('rules-preview.html','utf8'),fees=read('fees.html','utf8'),cloud=read('member-collection-preview.html','utf8'),packs=read('packs-live-preview.html','utf8');
assert.match(join,/href="\/rules-preview.html"/);assert.match(join,/href="\/fees.html"/);
for(const page of [rules,fees]){assert.match(page,/lang="ms"/);assert.match(page,/lang="zh-Hans"/);assert.match(page,/noindex,nofollow/);assert.doesNotMatch(page,/<form|<script|stripe\.com\/pay/i);}
assert.match(rules,/Not effective transaction terms/);assert.match(fees,/are not active/);assert.doesNotMatch(fees,/25%|20%|5%/);
assert.match(cloud,/CLOUD_COLLECTION_VERIFIED=false/);assert.match(packs,/Paid randomized packs, instant repurchase, cash withdrawal and stored-value credits are not offered/);
console.log('Integrated inactive-feature and policy consistency checks passed');
