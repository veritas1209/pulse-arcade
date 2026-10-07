import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
/** Transpile a source module and its local runtime dependencies into the QA sandbox. */
export function transpileQaModule(source,destination,seen=new Set()){
 source=path.resolve(source);destination=path.resolve(destination);if(seen.has(source))return;seen.add(source);
 let code=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const deps=[];code=code.replace(/from (['"])(\.[^'"]+)\1/g,(all,quote,spec)=>{const resolved=path.resolve(path.dirname(source),spec.endsWith('.ts')?spec:`${spec}.ts`);if(!fs.existsSync(resolved))return all;const outputSpec=spec.replace(/\.ts$/,'')+'.mjs';deps.push([resolved,path.resolve(path.dirname(destination),outputSpec)]);return `from ${quote}${outputSpec}${quote}`;});
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,code);for(const [dep,out]of deps)transpileQaModule(dep,out,seen);
}
