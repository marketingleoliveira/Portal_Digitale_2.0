export function canManageAI(user) {
  return ['dev','admin','diretoria','gerente'].includes(String(user?.role||'').toLowerCase()) ||
    String(user?.email||'').trim().toLowerCase()==='marketing@digitaletextil.com.br';
}
export function canReadAI(user) {
  return canManageAI(user) || String(user?.role||'').toLowerCase()==='sdr';
}
export function requireAIAccess(req,res,next) {
  if(!canReadAI(req.user))return res.status(403).json({error:'Seu cargo não tem acesso à IA DIGITALE.'});
  if(!['GET','HEAD'].includes(req.method)&&!canManageAI(req.user))return res.status(403).json({error:'Apenas a gestão pode alterar a prospecção.'});
  next();
}
