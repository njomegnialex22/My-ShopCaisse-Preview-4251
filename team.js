import { clients, authenticatedUser, cors, sendMethodNotAllowed } from '../lib/shared.js';
import { requireMember, can } from '../lib/permissions.js';

export default async function handler(req, res) {
  cors(req, res); if (sendMethodNotAllowed(req, res)) return;
  try {
    const { publicClient, admin } = clients();
    const auth = await authenticatedUser(req, publicClient);
    if (!auth) return res.status(401).json({ error: 'Session invalide. Reconnectez-vous.' });
    const { shopId, action } = req.body || {};
    const access = await requireMember(admin, shopId, auth.user.id);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const member = access.member;

    if (action === 'list') {
      if (!(await can(admin, member, 'equipe.read'))) return res.status(403).json({ error: 'Permission équipe refusée.' });
      const [{ data: members, error: me }, { data: roles, error: re }] = await Promise.all([
        admin.from('shop_members').select('id,user_id,role,role_id,status,ai_enabled,joined_at').eq('shop_id', shopId).order('created_at'),
        admin.from('shop_roles').select('id,name,description,is_system').eq('shop_id', shopId).order('name')
      ]);
      if (me) throw me; if (re) throw re;
      return res.status(200).json({ members, roles });
    }

    if (action === 'create_role') {
      if (member.role !== 'patron') return res.status(403).json({ error: 'Seul le patron peut créer un rôle.' });
      const name = String(req.body.name || '').trim().slice(0,60);
      const description = String(req.body.description || '').trim().slice(0,300);
      if (!name) return res.status(400).json({ error: 'Nom du rôle obligatoire.' });
      const { data, error } = await admin.from('shop_roles').insert({ shop_id: shopId, name, description, created_by: auth.user.id }).select('id,name,description').single();
      if (error) throw error;
      return res.status(201).json({ role: data });
    }

    if (action === 'set_permission') {
      if (member.role !== 'patron') return res.status(403).json({ error: 'Seul le patron peut modifier les permissions.' });
      const roleId = String(req.body.roleId || '');
      const key = String(req.body.permissionKey || '');
      if (!/^[0-9a-f-]{36}$/i.test(roleId) || !/^[a-z][a-z0-9_.:-]{1,99}$/.test(key)) return res.status(400).json({ error: 'Rôle ou permission invalide.' });
      const { data, error } = await admin.from('shop_role_permissions').upsert({ shop_id: shopId, role_id: roleId, permission_key: key, allowed: req.body.allowed === true, updated_by: auth.user.id }, { onConflict: 'role_id,permission_key' }).select().single();
      if (error) throw error;
      return res.status(200).json({ permission: data });
    }

    if (action === 'assign_role') {
      if (member.role !== 'patron') return res.status(403).json({ error: 'Seul le patron peut attribuer un rôle.' });
      const memberId = String(req.body.memberId || '');
      const roleId = req.body.roleId ? String(req.body.roleId) : null;
      const role = String(req.body.role || 'personnalise');
      if (!['gerant','vendeur','personnalise'].includes(role)) return res.status(400).json({ error: 'Type de rôle invalide.' });
      if (roleId) {
        const { data: roleRow, error: roleError } = await admin.from('shop_roles').select('id').eq('id', roleId).eq('shop_id', shopId).maybeSingle();
        if (roleError) throw roleError;
        if (!roleRow) return res.status(400).json({ error: 'Ce rôle ne fait pas partie de cette boutique.' });
      }
      const { data, error } = await admin.from('shop_members').update({ role, role_id: roleId }).eq('id', memberId).eq('shop_id', shopId).select('id,role,role_id').single();
      if (error) throw error;
      return res.status(200).json({ member: data });
    }

    if (action === 'set_member_status') {
      if (member.role !== 'patron') return res.status(403).json({ error: 'Seul le patron peut modifier le statut d’un membre.' });
      const memberId = String(req.body.memberId || '');
      const status = String(req.body.status || '');
      if (!['active','suspended','removed'].includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
      const { data, error } = await admin.from('shop_members').update({ status }).eq('id', memberId).eq('shop_id', shopId).neq('user_id', auth.user.id).select('id,status').single();
      if (error) throw error;
      return res.status(200).json({ member: data });
    }

    return res.status(400).json({ error: 'Action équipe inconnue.' });
  } catch (e) { console.error('[team]', e); return res.status(500).json({ error: 'Erreur serveur équipe.' }); }
}
