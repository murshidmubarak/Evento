async function run() {
  const res = await fetch('http://localhost:5000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Client',
      email: 'client@example.com',
      password: 'password123',
      phone: '1234567890'
    })
  });
  const data = await res.json();
  console.log(data);
}
run();
