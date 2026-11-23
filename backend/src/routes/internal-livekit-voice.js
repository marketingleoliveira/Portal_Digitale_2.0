import express from 'express';
import {randomUUID} from 'node:crypto';
import {AccessToken} from 'livekit-server-sdk';
const router=express.Router();
const hits=[];
router.post('/token',async(req,res)=>{
  const addr=req.socket.remoteAddress||'',host=String(req.headers.host||'');
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(addr)||!/^127\.0\.0\.1:\d+$/.test(host)||req.headers['x-forwarded-for'])return res.status(403).json({error:'Local only'});
  const t=Date.now();while(hits.length&&hits[0]<t-60000)hits.shift();if(hits.length>12)return res.status(429).json({error:'Limit'});hits.push(t);
  if(!process.env.LIVEKIT_API_KEY||!process.env.LIVEKIT_API_SECRET)return res.status(503).json({error:'LiveKit credentials unavailable'});
  const room='digitale-voice-'+randomUUID().replaceAll('-','');
  const key=process.env.LIVEKIT_API_KEY, secret=process.env.LIVEKIT_API_SECRET;
  async function signed(identity){const at=new AccessToken(key,secret,{identity,ttl:'10m',name:identity==='digitale-voice-agent'?'Digitale Voz':'Cliente teste'});at.addGrant({room,roomJoin:true,canSubscribe:true,canPublish:true,canPublishData:true,canUpdateOwnMetadata:false});return at.toJwt();}
  try{return res.json({room,clientToken:await signed('digitale-test-client'),agentToken:await signed('digitale-voice-agent')});}
  catch(e){console.error('DIGITALE_LIVEKIT_TOKEN_ERROR',String(e.message).slice(0,90));return res.status(500).json({error:'Token unavailable'});}
});
export default router;
