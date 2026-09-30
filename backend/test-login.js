import fetch from 'node-fetch';

(async () => {
  const res = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'client@example.com', password: 'password123' })
  });
  const data = await res.json();
  console.log(res.status, data);
})();
