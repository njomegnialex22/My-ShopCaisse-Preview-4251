import { createClient } from '@supabase/supabase-js';

export function cors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = process.env.APP_ORIGIN || '';
  if (allowed && origin === allowed) res.setHeader('Access-Control-Allow-Origin', allowed);
  else if (!allowed) res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
}

export function clients() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error('Configuration Supabase incomplète.');
  return {
    publicClient: createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }),
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  };
}

export async function authenticatedUser(req, publicClient) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const { data, error } = await publicClient.auth.getUser(match[1]);
  if (error || !data?.user) return null;
  return { user: data.user, token: match[1] };
}

export function sendMethodNotAllowed(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée.' }); return true; }
  return false;
}
