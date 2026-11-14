import { put, head } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { passwordOk, sleep } from '../lib/auth.js';

// Mapa 360 del FICC editable desde la propia página.
//   GET  /api/mapa360                      -> último estado guardado (o 404: la página usa el que trae incluido)
//   POST /api/mapa360                      -> guarda el estado (JSON)      · header x-admin-password
//   POST /api/mapa360?asset=1              -> sube una foto o imagen nueva · header x-admin-password, cuerpo = la imagen
const STATE_PATH = 'mapa360/estado.json';
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 4.3 * 1024 * 1024; // límite de Vercel por petición: 4.5 MB

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) { reject(Object.assign(new Error('too_large'), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(404).json({ error: 'Almacenamiento no configurado' });
    try {
      const b = await head(STATE_PATH);
      const r = await fetch(`${b.url}?v=${new Date(b.uploadedAt).getTime()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('read');
      return res.status(200).json(await r.json());
    } catch {
      return res.status(404).json({ error: 'Todavía no se ha guardado el mapa desde la página' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Falta conectar el almacenamiento Blob en Vercel.' });
  }
  if (!passwordOk(String(req.headers['x-admin-password'] || ''))) {
    await sleep(900);
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  let raw;
  try { raw = await readRaw(req); }
  catch (e) { return res.status(413).json({ error: 'Archivo demasiado grande', code: 'too_large' }); }

  try {
    if ('asset' in (req.query || {})) {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim();
      const ext = IMG_TYPES[type];
      if (!ext || !raw.length) return res.status(400).json({ error: 'Solo imágenes JPG, PNG o WEBP' });
      const name = createHash('sha256').update(raw).digest('hex').slice(0, 24);
      const b = await put(`mapa360/img-${name}.${ext}`, raw, {
        access: 'public', contentType: type, addRandomSuffix: false, allowOverwrite: true,
        cacheControlMaxAge: 31536000, // el nombre cambia si la imagen cambia
      });
      return res.status(200).json({ url: b.url });
    }

    let st;
    try { st = JSON.parse(raw.toString('utf8')); } catch { st = null; }
    if (!st || !Array.isArray(st.views) || !st.views.length) return res.status(400).json({ error: 'Datos del mapa inválidos' });
    if (/"data:image\//.test(raw.toString('utf8'))) return res.status(400).json({ error: 'Las imágenes deben subirse aparte' });
    await put(STATE_PATH, JSON.stringify(st), {
      access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo guardar en el almacenamiento' });
  }
}
