import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const manifest=JSON.parse(await readFile(new URL('./audio-sources.json',import.meta.url),'utf8'));
const target=process.argv[2]??'C:/tmp/battleship-audio-sources';
await mkdir(target,{recursive:true});
for(const source of manifest.sources){
 const response=await fetch(source.url);
 if(!response.ok)throw new Error(`${source.file}: HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 const actual=createHash('sha256').update(bytes).digest('hex');
 if(actual!==source.sha256)throw new Error(`${source.file}: expected ${source.sha256}, received ${actual}`);
 await writeFile(join(target,source.file),bytes);
 console.log(`${source.file} ${bytes.length} ${actual}`);
}
