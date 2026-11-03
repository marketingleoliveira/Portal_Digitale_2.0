import {getSettings} from '../services/digitale-ai-settings.mjs';
import express from 'express';
import crypto from 'node:crypto';
import {db} from '../database.js';
import {config} from '../config.js';
import {OWNER} from '../services/prospecting-policy.mjs';
import {verifyCandidate} from '../services/prospecting-auto-verification.mjs';
import {deliverVerified} from '../services/prospecting-auto-delivery.mjs';
const router=express.Router();
router.use((req,res,next)=>{
  const expected=Buffer.from(config.siteLeadSecret||''),received=Buffer.from(req.get('x-site-lead-secret')||'');
  if(!expected.length)return res.status(503).json({ok:false,error:'integration_not_configured'});
  if(expected.length!==received.length||!crypto.timingSafeEqual(expected,received))return res.status(403).json({ok:false,error:'invalid_integration_secret'});
  next();
});
router.get('/health',async(_req,res)=>{
  const [rows]=await db.execute("SELECT p.id,p.full_name FROM profiles p JOIN system_users u ON u.id=p.id WHERE p.is_active=1 AND u.disabled=0 AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND LOWER(r.role)='sdr') ORDER BY p.full_name");
  res.json({ok:Boolean(rows.length),owner:rows[0]?.full_name,owners:rows,distribution:'balanced_sdr',source:'IA PROSPECÇÃO',sourceSystem:'IA_PROSPECCAO'});
});
router.post('/',async(req,res)=>{
  if(req.body?.source!=='IA_PROSPECCAO'||!req.body?.verification?.website?.url||!req.body?.cnpj)return res.status(422).json({ok:false,error:'verified_discovery_required'});
  try {
    // Evidence booleans supplied by an integration are never sufficient on their own.
    const proof=await verifyCandidate({website:req.body.verification.website.url,cnpj:req.body.cnpj},{settings:await getSettings(db)});
    const result=await deliverVerified(db,proof);
    return res.status(result.created?201:200).json(result);
  }catch(error){return res.status(422).json({ok:false,error:/^[a-z_0-9]+$/i.test(error.message)?error.message:'verification_unavailable'});}
});
export default router;
