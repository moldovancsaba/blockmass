// Simple test server without mesh imports
import express from 'express';

const app = express();
const PORT = 3002;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Simple server works!' });
});

app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
});
