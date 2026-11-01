import crypto from 'node:crypto';
import { clients, authenticatedUser, cors, sendMethodNotAllowed } from '../lib/shared.js';
import { requireMember } from '../lib/permissions.js';
export default async function handler(req,res) {
  cors(req,res); if(sendMethodNotAllowed(req,res)) return;
  try {
    const {publicClient,admin}=clients();
    const auth=await authenticatedUser(req,publicClient);
    if(!auth) return res.status(401).json({error:'Session invalide.'});
    const {shopId,action}=req.body||{};
    if(action==='create') {
      const access=await requireMember(admin,shopId,auth.user.id);
      if(access.error) return res.status(access.status).json({error:access.error});
      if(access.member.role!=='patron') return res.status(403).json({error:'Seul le patron peut inviter un employé.'});
      const phone=String(req.body.phoneE164||'').trim();
      const role=String(req.body.role||'vendeur');
      const roleId=req.body.roleId?String(req.body.roleId):null;
      if(!/^\+[1-9][0-9]{7,14}$/.test(phone)) return res.status(400).json({error:'Numéro au format international requis, ex. +2376XXXXXXXX.'});
      if(!['gerant','vendeur','personnalise'].includes(role)) return res.status(400).json({error:'Rôle invalide.'});
      if(roleId) { const {data,error}=await admin.from('shop_roles').select('id').eq('id',roleId).eq('shop_id',shopId).maybeSingle(); if(error) throw error; if(!data) return res.status(400).json({error:'Rôle personnalisé introuvable.'}); }
      const token=crypto.randomBytes(32).toString('base64url');
      const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
      const {data,error}=await admin.from('shop_invitations').insert({shop_id:shopId,phone_e164:phone,role,role_id:roleId,token_hash:tokenHash,status:'pending',expires_at:new Date(Date.now()+7*86400000).toISOString(),invited_by:auth.user.id}).select('id,expires_at').single();
      if(error) throw error;
      const origin=process.env.APP_ORIGIN||'';
      return res.status(201).json({invitationId:data.id,token,expiresAt:data.expires_at,inviteUrl:origin?`${origin}/?invite=${encodeURIComponent(token)}`:null});
    }
    if(action==='accept') {
      const token=String(req.body.token||'');
      if(token.length<30 || !auth.user.phone) return res.status(400).json({error:'Invitation ou téléphone du compte invalide.'});
      const hash=crypto.createHash('sha256').update(token).digest('hex');
      const {data:inv,error:ie}=await admin.from('shop_invitations').select('*').eq('token_hash',hash).eq('status','pending').gt('expires_at',new Date().toISOString()).maybeSingle();
      if(ie) throw ie; if(!inv) return res.status(404).json({error:'Invitation expirée ou invalide.'});
      if(inv.phone_e164!==auth.user.phone) return res.status(403).json({error:'Le compte connecté ne correspond pas au numéro invité.'});
      const {error:me}=await admin.from('shop_members').upsert({shop_id:inv.shop_id,user_id:auth.user.id,role:inv.role,role_id:inv.role_id,status:'active',joined_at:new Date().toISOString()},{onConflict:'shop_id,user_id'});
      if(me) throw me;
      const {error:ue}=await admin.from('shop_invitations').update({status:'accepted',accepted_by:auth.user.id,accepted_at:new Date().toISOString()}).eq('id',inv.id);
      if(ue) throw ue;
      return res.status(200).json({shopId:inv.shop_id,role:inv.role,roleId:inv.role_id});
    }
    return res.status(400).json({error:'Action invitation inconnue.'});
  } catch(e) { console.error('[invite]',e); return res.status(500).json({error:'Erreur serveur invitation.'}); }
}
