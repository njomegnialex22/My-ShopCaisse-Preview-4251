import { clients, authenticatedUser, cors, sendMethodNotAllowed } from '../lib/shared.js';
import { requireMember, can } from '../lib/permissions.js';
const TYPES = new Set(['vente','client','stock','parametre','cloture','depense','autre']);
export default async function handler(req, res) {
  cors(req,res); if(sendMethodNotAllowed(req,res)) return;
  try {
    const { publicClient, admin } = clients();
    const auth = await authenticatedUser(req, publicClient);
    if(!auth) return res.status(401).json({error:'Session invalide.'});
    const { shopId, action } = req.body || {};
    const access = await requireMember(admin,shopId,auth.user.id);
    if(access.error) return res.status(access.status).json({error:access.error});
    const member = access.member;
    if(action === 'push') {
      const records = Array.isArray(req.body.records) ? req.body.records.slice(0,100) : [];
      if(!records.length) return res.status(400).json({error:'Aucun enregistrement à synchroniser.'});
      const rows=[];
      for(const r of records) {
        const type=String(r?.entityType||'');
        if(!TYPES.has(type)) return res.status(400).json({error:'Type de donnée non pris en charge.'});
        if(!(await can(admin,member,`${type}.write`))) return res.status(403).json({error:`Permission d’écriture refusée : ${type}.`});
        const entityId=String(r?.entityId||'').slice(0,150);
        if(!entityId) return res.status(400).json({error:'Identifiant de donnée manquant.'});
        const operation=r?.operation==='delete'?'delete':'upsert';
        const payload=operation==='delete'?null:r?.payload;
        if(operation==='upsert' && (payload===undefined || JSON.stringify(payload).length>100000)) return res.status(400).json({error:'Donnée invalide ou trop volumineuse.'});
        rows.push({shop_id:shopId,entity_type:type,entity_id:entityId,operation,payload,created_by:auth.user.id,updated_at:new Date().toISOString()});
      }
      const {data,error}=await admin.from('shop_sync_records').upsert(rows,{onConflict:'shop_id,entity_type,entity_id'}).select('id,entity_type,entity_id,operation,revision,updated_at');
      if(error) throw error;
      return res.status(200).json({accepted:data.length,records:data});
    }
    if(action === 'pull') {
      const after = req.body.after ? String(req.body.after) : null;
      const types = Array.isArray(req.body.types) ? req.body.types.filter(t=>TYPES.has(t)) : [...TYPES];
      for(const type of types) if(!(await can(admin,member,`${type}.read`))) return res.status(403).json({error:`Permission de lecture refusée : ${type}.`});
      let query=admin.from('shop_sync_records').select('id,entity_type,entity_id,operation,payload,revision,updated_at').eq('shop_id',shopId).in('entity_type',types).order('updated_at',{ascending:true}).limit(500);
      if(after) query=query.gt('updated_at',after);
      const {data,error}=await query; if(error) throw error;
      return res.status(200).json({records:data||[],nextCursor:data?.length?data[data.length-1].updated_at:after});
    }
    return res.status(400).json({error:'Action de synchronisation inconnue.'});
  } catch(e) { console.error('[sync]',e); return res.status(500).json({error:'Erreur serveur de synchronisation.'}); }
}
