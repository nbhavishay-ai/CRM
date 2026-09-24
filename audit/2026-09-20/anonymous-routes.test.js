import { test as bunTest, expect } from 'bun:test';
import { NextRequest } from 'next/server';
import { writeFileSync } from 'node:fs';
import { Glob } from 'bun';
const test = globalThis.__auditPrisma ? bunTest : bunTest.skip;

test('Anonymous requests are rejected across protected route handlers', async () => {
  const results = [];
  const root = `${import.meta.dir}/../../app/api`;
  for await (const file of new Glob('**/route.ts').scan(root)) {
    const normalized = file.replaceAll('\\','/');
    // Public login, logout and VAPID discovery are intentionally outside this check.
    if (['auth/login/route.ts','auth/logout/route.ts','import/template/route.ts'].includes(normalized)) continue;
    const mod = await import(`${root}/${normalized}`);
    const route = '/api/' + normalized.replace(/\/route.ts$/,'').replaceAll('[id]','audit-missing-id');
    for (const method of ['GET','POST','PATCH','DELETE','PUT']) {
      if (typeof mod[method] !== 'function') continue;
      if (normalized === 'push/subscribe/route.ts' && method === 'GET') continue;
      const req = new NextRequest(`http://localhost${route}`,{method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:'{}'})});
      const response = await mod[method](req,{params:Promise.resolve({id:'audit-missing-id'})});
      results.push({route,method,status:response.status});
      expect([401,403]).toContain(response.status);
    }
  }
  writeFileSync(`${import.meta.dir}/anonymous-routes.json`,JSON.stringify(results,null,2));
  console.log(`Checked ${results.length} protected route-method combinations`);
});
