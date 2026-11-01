import { clients, authenticatedUser, cors, sendMethodNotAllowed } from '../lib/shared.js';

export default async function handler(req, res) {
  cors(req, res);
  if (sendMethodNotAllowed(req, res)) return;
  try {
    const { publicClient, admin } = clients();
    const auth = await authenticatedUser(req, publicClient);
    if (!auth) return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });

    const { data: existing, error: findError } = await admin
      .from('shop_members').select('shop_id, role, status')
      .eq('user_id', auth.user.id).eq('status', 'active').limit(1).maybeSingle();
    if (findError) throw findError;
    if (existing) return res.status(200).json({ shopId: existing.shop_id, role: existing.role, existing: true });

    const name = String(req.body?.shopName || '').trim().slice(0, 80);
    const currency = String(req.body?.currency || 'XAF').toUpperCase();
    if (!name) return res.status(400).json({ error: 'Nom de boutique manquant.' });
    const allowedCurrencies = ['XAF','XOF','NGN','GHS','KES','MAD','GNF','RWF','CDF','ZAR','USD','EUR'];
    if (!allowedCurrencies.includes(currency)) return res.status(400).json({ error: 'Devise non prise en charge.' });

    const { data: shop, error: shopError } = await admin.from('shops').insert({
      name, currency, owner_user_id: auth.user.id, plan: 'free', subscription_status: 'inactive'
    }).select('id').single();
    if (shopError) throw shopError;

    const { error: memberError } = await admin.from('shop_members').insert({
      shop_id: shop.id, user_id: auth.user.id, role: 'patron', status: 'active', ai_enabled: true
    });
    if (memberError) {
      await admin.from('shops').delete().eq('id', shop.id);
      throw memberError;
    }
    return res.status(201).json({ shopId: shop.id, role: 'patron', existing: false });
  } catch (e) {
    console.error('[cloud-register]', e);
    return res.status(500).json({ error: 'Impossible de créer le profil cloud. Vérifiez le schéma Supabase.' });
  }
}
