if (process.env.VERCEL === '1') {
  console.log('Skipping database mutation during build; run reviewed migrations separately.');
}