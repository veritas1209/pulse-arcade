// Compatibility entry point: the current recorded mix uses longer real source sections,
// source-only layering and a CPU filter pass. No game/WebGL context is created.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const cwd=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const [cmd,args] of [[process.execPath,['scripts/decode-audio-quality.mjs']],['python',['scripts/audio-quality-assets.py']]]){
 const result=spawnSync(cmd,args,{cwd,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
