async function runLiveProductionBenchmark() {
  const baseUrl = 'https://orvion-one.vercel.app';
  console.log('===============================================================');
  console.log(`  BENCHMARKING LIVE VERCEL PRODUCTION: ${baseUrl}  `);
  console.log('===============================================================\n');

  const publicRoutes = [
    { name: 'Login Portal (HTML Page)', path: '/login' },
    { name: 'Root Redirect Route', path: '/' },
    { name: 'Unauthenticated API /api/auth/me', path: '/api/auth/me' },
    { name: 'Template Export /api/import/template', path: '/api/import/template' },
    { name: 'Calling Template /api/import/template?type=calling', path: '/api/import/template?type=calling' },
  ];

  for (const r of publicRoutes) {
    const start = performance.now();
    try {
      const res = await fetch(`${baseUrl}${r.path}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const end = performance.now();
      const duration = (end - start).toFixed(1);
      console.log(`[HTTP ${res.status}] ${r.name.padEnd(45)} -> ${duration} ms`);
    } catch (e: any) {
      console.error(`[ERROR] ${r.name}:`, e.message);
    }
  }

  console.log('\n===============================================================');
  console.log('  LIVE PRODUCTION BENCHMARK COMPLETE                          ');
  console.log('===============================================================\n');
}

runLiveProductionBenchmark();
