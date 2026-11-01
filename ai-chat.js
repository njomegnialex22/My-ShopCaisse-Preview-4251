import { clients, authenticatedUser, cors, sendMethodNotAllowed } from '../lib/shared.js';

const MAX_MESSAGE = 1800;
const MAX_HISTORY = 8;
const MODEL_FAST = 'gpt-4.1-mini';
const MODEL_DEEP = 'gpt-4.1';

function chooseModel(question) {
  const q = question.toLowerCase();
  return /(compar|compare|strat[eé]g|plan d'action|plan d’action|pr[eé]vision|pr[eé]voir|optimis|augmenter.*b[eé]n[eé]fice|b[eé]n[eé]fice.*augmenter|analyse approfondie|pourquoi.*baiss|rentabilit[eé]|marge.*mois|mois.*mois)/i.test(q)
    ? MODEL_DEEP : MODEL_FAST;
}

function safeSnapshot(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const topProducts = Array.isArray(s.topProducts) ? s.topProducts.slice(0, 5).map(p => ({
    name: String(p?.name || 'Produit').slice(0, 70), quantity: num(p?.qty), revenue: num(p?.revenue)
  })) : [];
  const lowStock = Array.isArray(s.lowStock) ? s.lowStock.slice(0, 8).map(p => ({
    name: String(p?.name || 'Produit').slice(0, 70), quantity: num(p?.qty), threshold: num(p?.low)
  })) : [];
  return {
    month: String(s.month || '').slice(0, 40), currency: String(s.currency || 'XAF').slice(0, 6),
    revenue: num(s.revenue), estimatedNetProfit: num(s.netProfit), grossProfit: num(s.grossProfit),
    expenses: num(s.expenses), salesCount: num(s.salesCount), previousRevenue: num(s.previousRevenue),
    growthPercent: s.growth == null ? null : num(s.growth), totalDebt: num(s.totalDebt),
    productCount: num(s.productCount), missingPurchaseCosts: num(s.missingPurchaseCosts),
    topProducts, lowStock
  };
}

export default async function handler(req, res) {
  cors(req, res);
  if (sendMethodNotAllowed(req, res)) return;
  try {
    const { publicClient, admin } = clients();
    const auth = await authenticatedUser(req, publicClient);
    if (!auth) return res.status(401).json({ error: 'Session invalide. Reconnectez-vous.' });

    const shopId = String(req.body?.shopId || '');
    const question = String(req.body?.message || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(shopId)) return res.status(400).json({ error: 'Boutique cloud invalide.' });
    if (!question || question.length > MAX_MESSAGE) return res.status(400).json({ error: 'La question doit contenir entre 1 et 1 800 caractères.' });

    const { data: member, error: memberError } = await admin.from('shop_members')
      .select('role,status,ai_enabled').eq('shop_id', shopId).eq('user_id', auth.user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!member || member.status !== 'active') return res.status(403).json({ error: 'Vous ne faites pas partie de cette boutique.' });
    if (!member.ai_enabled || !['patron','gerant'].includes(member.role))
      return res.status(403).json({ error: 'Votre rôle ne dispose pas de l’autorisation Intelligence IA.' });

    const { data: shop, error: shopError } = await admin.from('shops')
      .select('id,plan,subscription_status,subscription_expires_at').eq('id', shopId).single();
    if (shopError) throw shopError;
    const active = shop.subscription_status === 'active' && (!shop.subscription_expires_at || new Date(shop.subscription_expires_at).getTime() > Date.now());
    if (!active || !['standard','pro'].includes(shop.plan))
      return res.status(403).json({ error: 'L’accès IA nécessite un abonnement Standard ou Pro actif.' });

    const { data: plan, error: planError } = await admin.from('ai_plan_limits')
      .select('monthly_messages,enabled').eq('plan', shop.plan).single();
    if (planError) throw planError;
    if (!plan.enabled || plan.monthly_messages < 1) return res.status(403).json({ error: 'L’IA n’est pas activée pour cet abonnement.' });

    const period = new Date().toISOString().slice(0, 7) + '-01';
    const { data: quota, error: quotaError } = await admin.rpc('consume_ai_quota', {
      p_shop_id: shopId, p_period: period, p_limit: plan.monthly_messages
    });
    if (quotaError) throw quotaError;
    const usage = Array.isArray(quota) ? quota[0] : quota;
    if (!usage?.allowed) return res.status(429).json({
      error: 'Quota mensuel atteint. Le compteur sera réinitialisé au début du mois prochain.',
      used: usage?.used ?? plan.monthly_messages, limit: plan.monthly_messages, remaining: 0
    });

    const snapshot = safeSnapshot(req.body?.shopData);
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-MAX_HISTORY).map(m => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user', content: String(m?.content || '').slice(0, 1200)
    })).filter(m => m.content) : [];
    const model = chooseModel(question);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY absente des variables Vercel.');

    const instructions = [
      'Tu es Ma Caisse Intelligence, un conseiller de gestion pour les petits commerces en Afrique.',
      'Réponds en français sauf si la question est clairement dans une autre langue.',
      'Base tes analyses uniquement sur les données fournies. Ne fabrique aucun chiffre et signale les données manquantes.',
      'Donne des conseils pratiques, adaptés à une petite boutique, avec des actions concrètes et priorisées.',
      'Les montants sont exprimés dans la devise fournie. Explique les calculs lorsque c’est utile.',
      'Les données sont un instantané local fourni par l’application et ne sont pas vérifiées par un système comptable externe.',
      'Ne demande et ne révèle jamais de noms, numéros WhatsApp ou informations personnelles de clients.',
      'Ne prétends jamais effectuer une vente, modifier un stock, contacter un client ou exécuter une action dans l’application.',
      'Si une question concerne une décision financière importante, recommande de vérifier les chiffres et les justificatifs.'
    ].join('\n');
    const input = [
      { role: 'user', content: 'Contexte chiffré de la boutique (sans données personnelles) :\n' + JSON.stringify(snapshot) },
      ...history,
      { role: 'user', content: question }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let aiResponse;
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: controller.signal,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, instructions, input, max_output_tokens: 900, store: false })
      });
      aiResponse = await response.json();
      if (!response.ok) {
        console.error('[openai]', response.status, aiResponse?.error?.message || 'API error');
        return res.status(response.status === 429 ? 503 : 502).json({ error: 'Le service IA est momentanément indisponible. Réessayez dans quelques instants.' });
      }
    } finally { clearTimeout(timeout); }

    let answer = String(aiResponse.output_text || '').trim();
    if (!answer && Array.isArray(aiResponse.output)) {
      answer = aiResponse.output.flatMap(item => item.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n').trim();
    }
    if (!answer) throw new Error('Réponse IA vide.');

    return res.status(200).json({ answer, model, used: usage.used, limit: plan.monthly_messages, remaining: Math.max(0, plan.monthly_messages - usage.used) });
  } catch (e) {
    console.error('[ai-chat]', e);
    const aborted = e?.name === 'AbortError';
    return res.status(500).json({ error: aborted ? 'La réponse prend trop de temps. Réessayez.' : 'Erreur serveur pendant la préparation de la réponse IA.' });
  }
}
