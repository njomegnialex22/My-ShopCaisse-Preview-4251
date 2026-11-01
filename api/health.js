import { createClient } from '@supabase/supabase-js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin',process.env.APP_ORIGIN||'*');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'Méthode non autorisée.'});
  const url=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const config={supabaseUrl:!!url,publicKey:!!anon,serverSecret:!!secret,openaiKey:!!process.env.OPENAI_API_KEY};
  if(!url||!anon||!secret) return res.status(503).json({ok:false,config,database:false,error:'Variables Supabase manquantes.'});
  try {
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {error}=await admin.from('shops').select('id').limit(1);
    if(error) throw error;
    return res.status(200).json({ok:true,config,database:true,apiVersion:'4.2.5.1'});
  } catch(e) {
    console.error('[health]',e);
    return res.status(503).json({ok:false,config,database:false,error:'Connexion Supabase impossible. Vérifiez la clé serveur et les tables.'});
  }
                                 }
