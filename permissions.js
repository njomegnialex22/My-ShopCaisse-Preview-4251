// Contrôle des permissions côté serveur. Le patron conserve toujours le contrôle total.
const DEFAULTS = {
  gerant: new Set(['ventes.read','ventes.write','clients.read','clients.write','stock.read','stock.write','depenses.read','depenses.write','clotures.read','clotures.write','rapports.read','equipe.read']),
  vendeur: new Set(['ventes.read','ventes.write','clients.read','clients.write','stock.read','clotures.read']),
  personnalise: new Set()
};

export async function getMember(admin, shopId, userId) {
  const { data, error } = await admin.from('shop_members')
    .select('id,shop_id,user_id,role,role_id,status,ai_enabled')
    .eq('shop_id', shopId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function can(admin, member, permission) {
  if (!member || member.status !== 'active') return false;
  if (member.role === 'patron') return true;
  if (member.role_id) {
    const { data, error } = await admin.from('shop_role_permissions')
      .select('allowed').eq('shop_id', member.shop_id).eq('role_id', member.role_id)
      .eq('permission_key', permission).maybeSingle();
    if (error) throw error;
    return data?.allowed === true;
  }
  return DEFAULTS[member.role]?.has(permission) === true;
}

export async function requireMember(admin, shopId, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(shopId || ''))) return { error: 'Boutique invalide.', status: 400 };
  const member = await getMember(admin, shopId, userId);
  if (!member || member.status !== 'active') return { error: 'Accès à cette boutique refusé.', status: 403 };
  return { member };
}
