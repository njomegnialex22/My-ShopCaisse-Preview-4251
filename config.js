export default function handler(req, res) {
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); return res.status(204).end(); }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(503).json({ error: 'Configuration Supabase incomplète sur le serveur.' });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || '*');
  return res.status(200).json({ supabaseUrl: url, supabaseAnonKey: anonKey });
}
