import { writeFileSync } from 'node:fs';
const paths = ['/login','/dashboard','/dashboard/admin/dashboard','/api/users','/api/leads','/api/meetings','/api/hr/employees','/api/reports','/manifest.json','/sw.js','/icon-192.png'];
const results = [];
for (const path of paths) {
  const response = await fetch(`http://localhost:3217${path}`,{redirect:'manual'});
  results.push({path,status:response.status,location:response.headers.get('location'),contentType:response.headers.get('content-type')});
}
writeFileSync(`${import.meta.dir}/http-smoke.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
