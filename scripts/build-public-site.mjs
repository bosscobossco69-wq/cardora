import {mkdirSync,rmSync,copyFileSync,lstatSync,readdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
// Only reviewed browser-facing pages enter static output. Source, drafts, tests and SQL stay out.
const publicFiles=['index.html','join.html','fees.html','rules-preview.html','listing-guide.html','how-to-spot-a-fake-pokemon-card.html','pokemon-card-numbers-explained.html','sar-sir-ar-difference.html','robots.txt','sitemap.xml','googleabb4dbb1b7252a65.html'];
const previewFiles=['collection-preview.html','member-collection-preview.html','packs-live-preview.html'];
const root=process.cwd(),out=resolve(root,'dist');
const files=[...publicFiles,...(process.env.VERCEL_ENV==='preview'?previewFiles:[])];
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const file of files){const source=join(root,file);if(!lstatSync(source).isFile())throw Error('Expected regular file: '+file);const target=join(out,file);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);}
const actual=readdirSync(out).sort();if(JSON.stringify(actual)!==JSON.stringify([...files].sort()))throw Error('Unexpected static output');
console.log('Static publication allowlist: '+actual.length+' files.');
