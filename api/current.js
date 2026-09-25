import { head } from '@vercel/blob';
import { PDF_PATHNAME } from '../lib/auth.js';

// GET /api/current -> the edition the admin last uploaded, or 404 so the page
// falls back to the revista.pdf bundled with the site.
export default async function handler(req, res) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'Almacenamiento no configurado' });
  }
  try {
    const blob = await head(PDF_PATHNAME);
    const version = new Date(blob.uploadedAt).getTime();
    // short CDN cache keeps Blob API calls low while new uploads show up quickly
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      url: `${blob.url}?v=${version}`,
      downloadUrl: blob.downloadUrl,
      uploadedAt: blob.uploadedAt,
      size: blob.size,
    });
  } catch {
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    return res.status(404).json({ error: 'Todavía no se ha subido ninguna edición' });
  }
}
