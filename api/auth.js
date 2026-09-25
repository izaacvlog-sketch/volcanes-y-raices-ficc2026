import { passwordOk, sleep, readJsonBody } from '../lib/auth.js';

// POST /api/auth  { password }  ->  200 if the admin password is right.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({
      error: 'Falta configurar la variable ADMIN_PASSWORD en Vercel (Settings → Environment Variables).',
    });
  }
  const { password } = readJsonBody(req);
  if (!passwordOk(password)) {
    await sleep(900); // slows down password guessing
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  return res.status(200).json({
    ok: true,
    storageReady: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  });
}
