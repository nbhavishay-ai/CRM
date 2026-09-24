import { Glob } from 'bun';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const root = `${import.meta.dir}/../..`;
const files = [];
for (const folder of ['app','components','lib','services','tests','scripts','prisma']) {
  for await (const file of new Glob('**/*.{ts,tsx,js,mjs,prisma}').scan(`${root}/${folder}`)) {
    const path = `${folder}/${file.replaceAll('\\','/')}`;
    const content = readFileSync(`${root}/${path}`);
    files.push({path,sha256:createHash('sha256').update(content).digest('hex'),lines:content.toString().split('\n').length});
  }
}
files.sort((a,b)=>a.path.localeCompare(b.path));
const lint = JSON.parse(readFileSync(`${import.meta.dir}/lint.json`,'utf8'));
const result = {generatedAt:new Date().toISOString(),files:files.length,lines:files.reduce((n,f)=>n+f.lines,0),apiRouteFiles:files.filter(f=>f.path.startsWith('app/api/')&&f.path.endsWith('/route.ts')).length,pageFiles:files.filter(f=>f.path.endsWith('/page.tsx')).length,lint:{errors:lint.reduce((n,f)=>n+f.errorCount,0),warnings:lint.reduce((n,f)=>n+f.warningCount,0)},sourceFiles:files};
writeFileSync(`${import.meta.dir}/inventory.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,sourceFiles:undefined}));
