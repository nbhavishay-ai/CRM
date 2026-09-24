async function testLiveUsers() {
  const loginRes = await fetch('https://orvion-one.vercel.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nehra@orvion.com', password: 'Nehra@1228' }),
  });

  const loginData = await loginRes.json();
  const token = loginData.token;

  console.log('Login Result:', loginData.success ? 'Success' : loginData);

  // Perform 5 sequential fetches to hit potentially different serverless lambdas
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(`https://orvion-one.vercel.app/api/users?t=${Date.now()}_${i}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    console.log(`Fetch #${i} Users Count:`, data.users?.length);
    console.log(`Fetch #${i} Users:`, data.users?.map((u: any) => `${u.name} (${u.role})`).join(', '));
  }
}

testLiveUsers().catch(console.error);
