import { handleUpload } from '@vercel/blob/client';
import { passwordOk, sleep, readJsonBody, PDF_PATHNAME } from '../lib/auth.js';

// Issues a short-lived upload token so the admin's browser can send the PDF straight to
// Vercel Blob (large files never pass through this function, which has a 4.5 MB body limit).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: 'Falta conectar un almacenamiento Blob al proyecto en Vercel (Storage → Create → Blob).',
    });
  }

  try {
    const json = await handleUpload({
      body: readJsonBody(req),
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let password = '';
        try { password = JSON.parse(clientPayload || '{}').password || ''; } catch { /* ignore */ }
        if (!passwordOk(password)) {
          await sleep(900);
          throw new Error('Contraseña incorrecta');
        }
        if (pathname !== PDF_PATHNAME) throw new Error('Ruta de archivo no permitida');
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: 300 * 1024 * 1024, // 300 MB
          addRandomSuffix: false,
          allowOverwrite: true, // each new edition replaces the previous one
          cacheControlMaxAge: 60, // visitors see the new edition within about a minute
          validUntil: Date.now() + 60 * 60 * 1000,
        };
      },
    });
    return res.status(200).json(json);
  } catch (err) {
    const msg = err && err.message ? err.message : 'No se pudo autorizar la subida';
    return res.status(msg === 'Contraseña incorrecta' ? 401 : 400).json({ error: msg });
  }
}
