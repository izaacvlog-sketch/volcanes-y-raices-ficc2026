import { put, list } from '@vercel/blob';

// Contador de registros del FICC 2026.
//   POST /api/registros {tipo, personas} -> suma un registro (no guarda datos personales)
//   GET  /api/registros                  -> { registros, asistentes, porTipo }
// Cada registro es un archivo vacío en Vercel Blob: registros/<tipo>/<fecha>-<azar>-p<personas>.txt
// Así dos registros al mismo tiempo nunca se pisan.
const PREFIX = 'ficc2026-registros/';
const TIPOS = {
  'Concurso Grano de Oro': 'grano-de-oro',
  'Visitante': 'visitante',
  'Expositor / stand comercial': 'expositor',
  'Productor de café': 'productor',
  'Barista o catador': 'barista',
  'Medio de comunicación': 'medio',
  'Patrocinador': 'patrocinador',
  'Torneo de Ajedrez': 'ajedrez',
};
const NOMBRES = Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [v, k]));

export default async function handler(req, res) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Almacenamiento no configurado' });
  }

  if (req.method === 'GET') {
    try {
      const porTipo = {};
      let registros = 0, asistentes = 0, cursor;
      do {
        const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
        for (const b of r.blobs) {
          const m = b.pathname.slice(PREFIX.length).match(/^([a-z-]+)\/.*-p(\d+)\.txt$/);
          if (!m) continue;
          const tipo = NOMBRES[m[1]] || m[1];
          const p = Math.max(1, Math.min(200, parseInt(m[2], 10) || 1));
          registros += 1; asistentes += p;
          porTipo[tipo] = (porTipo[tipo] || 0) + p;
        }
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
      // caché corto: el número se actualiza cada ~30 s sin gastar operaciones de más
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({ registros, asistentes, porTipo });
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({ error: 'No se pudo leer el contador' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  res.setHeader('Cache-Control', 'no-store');

  // solo desde la página del festival
  const origin = String(req.headers.origin || req.headers.referer || '');
  if (origin && !/revistavolcanesyraices\.com\.mx|vercel\.app|localhost/.test(origin)) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const slug = TIPOS[String(body.tipo || '')];
  if (!slug) return res.status(400).json({ error: 'Tipo de registro inválido' });
  const personas = Math.max(1, Math.min(200, parseInt(body.personas, 10) || 1));

  try {
    const name = `${PREFIX}${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-p${personas}.txt`;
    await put(name, '1', { access: 'public', contentType: 'text/plain', addRandomSuffix: false });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'No se pudo registrar' });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
