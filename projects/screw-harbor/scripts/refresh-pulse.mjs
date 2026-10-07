import {mkdir,rename,realpath,lstat,readdir,readFile,cp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const release=path.join(root,'release');
const history=path.join(release,'history',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(history,{recursive:true});
async function verifyCopy(source,destination) {
 const info=await lstat(source);
 if(info.isSymbolicLink())throw Error('Unexpected package symlink');
 if(info.isDirectory()) {
  for(const name of await readdir(source))await verifyCopy(path.join(source,name),destination&&path.join(destination,name));
 }else if(destination&&!(await readFile(source)).equals(await readFile(destination)))throw Error('Archive verification failed');
}
for(const name of ['screw-harbor','catalog-entry.json','manifest.json']){
 const target=path.join(release,'pulse',name);
 try{
  const info=await lstat(target);if(info.isSymbolicLink())throw Error('Unexpected symlink');
  const resolved=await realpath(target);
  if(!resolved.startsWith(release+path.sep)||!history.startsWith(release+path.sep))throw Error('Unexpected package path');
  const destination=path.join(history,name);
  await verifyCopy(target);
  try { await rename(target,destination); }
  catch(e) {
   if(e.code!=='EPERM')throw e;
   // Windows may deny directory rename even when its files can be archived.
   await cp(target,destination,{recursive:true,errorOnExist:true,force:false});
   await verifyCopy(target,destination);
   const checked=await realpath(target);
   if(checked!==resolved||!checked.startsWith(release+path.sep)||!(await realpath(destination)).startsWith(history+path.sep))throw Error('Unexpected archive path');
   await rm(checked,{recursive:true,force:false,maxRetries:2});
  }
 }catch(e){if(e.code!=='ENOENT')throw e;}
}
const result=spawnSync(process.execPath,[path.join(root,'scripts/prepare-pulse.mjs')],{cwd:root,stdio:'inherit'});
process.exitCode=result.status??1;
