import {useEffect,useRef,useState} from 'react';
import {attachTrainingVideoGuard} from './trainingVideoGuard';
type Props={src:string;label:string;token:string;lessonId:string;canSeek?:boolean;onError:()=>void;onCompleted:()=>void};
const BASE='/api/training-v2/commercial-course';
export default function TrainingFocusedVideo({src,label,token,lessonId,canSeek=false,onError,onCompleted}:Props){
 const videoRef=useRef<HTMLVideoElement>(null),scopeRef=useRef<HTMLDivElement>(null);
 const sessionRef=useRef(''),generation=useRef(0),queue=useRef(Promise.resolve()),completedCallback=useRef(onCompleted);
 const allowedTime=useRef(0), lastTick=useRef(0);
 const [message,setMessage]=useState(''),[checking,setChecking]=useState(false);
 completedCallback.current=onCompleted;
 const request=async(path:string,body:unknown)=>{
  const r=await fetch(BASE+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error?.message||'Não foi possível validar a reprodução.');return j.data;
 };
 const interrupt=(id:string)=>{if(id)void fetch(BASE+'/sessions/'+id+'/interrupt',{method:'POST',keepalive:true,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'}).catch(()=>{});};
 const stop=(notice=true)=>{generation.current++;const id=sessionRef.current;sessionRef.current='';interrupt(id);if(notice){setChecking(false);setMessage('O vídeo foi interrompido e voltou ao início. Pressione Play para assistir novamente.');}};
 useEffect(()=>{
  const video=videoRef.current,scope=scopeRef.current;if(!video||!scope)return;
  // Playback is fixed at normal speed, including changes from browser shortcuts.
  const enforceNormalSpeed=()=>{if(video.defaultPlaybackRate!==1)video.defaultPlaybackRate=1;if(video.playbackRate!==1)video.playbackRate=1;};
  enforceNormalSpeed();
  video.addEventListener('ratechange',enforceNormalSpeed);
  video.addEventListener('play',enforceNormalSpeed);
  allowedTime.current=0;lastTick.current=performance.now();
  const track=()=>{const now=performance.now();if(!video.seeking&&!video.paused&&video.currentTime<=allowedTime.current+Math.max(0.35,(now-lastTick.current)/1000+0.2))allowedTime.current=Math.max(allowedTime.current,video.currentTime);lastTick.current=now;};
  const blockSeek=()=>{if(!canSeek&&Math.abs(video.currentTime-allowedTime.current)>0.25){video.currentTime=allowedTime.current;}};
  const resetTime=()=>{allowedTime.current=0;lastTick.current=performance.now();};
  video.addEventListener('timeupdate',track);video.addEventListener('seeking',blockSeek);video.addEventListener('loadedmetadata',resetTime);
  const dispose=attachTrainingVideoGuard(video,scope,()=>{resetTime();stop();});
  return()=>{video.removeEventListener('timeupdate',track);video.removeEventListener('seeking',blockSeek);video.removeEventListener('loadedmetadata',resetTime);video.removeEventListener('ratechange',enforceNormalSpeed);video.removeEventListener('play',enforceNormalSpeed);stop(false);dispose();};
 },[src,token,lessonId,canSeek]);
 const start=async()=>{
  const video=videoRef.current;if(!video||video.paused)return;
  const run=++generation.current;sessionRef.current='';setMessage('');setChecking(false);
  try{
   const data=await request('/lessons/'+lessonId+'/video/start',{allowSeek:canSeek});
   if(run!==generation.current||video.paused){interrupt(data.id);return;}
   sessionRef.current=data.id;
  }catch(e:any){if(run!==generation.current)return;stop();video.pause();video.currentTime=0;setMessage(e.message);}
 };
 const pulse=(ended=false)=>{
  const video=videoRef.current,id=sessionRef.current,run=generation.current;
  if(!video||!id)return;
  const position=video.currentTime;
  queue.current=queue.current.catch(()=>{}).then(async()=>{
   if(run!==generation.current||id!==sessionRef.current)return;
   try{
    const data=await request('/sessions/'+id+'/pulse',{position,ended});
    if(run!==generation.current||id!==sessionRef.current)return;
    if(data.completed){sessionRef.current='';setChecking(false);completedCallback.current();}
    else if(ended){setChecking(false);stop();video.currentTime=0;setMessage('Não foi possível confirmar o vídeo completo. Assista novamente desde o início, sem avançar.');}
   }catch(e:any){if(run!==generation.current||id!==sessionRef.current)return;stop();video.pause();video.currentTime=0;setMessage(e.message);}
  });
 };
 useEffect(()=>{const timer=window.setInterval(()=>{if(videoRef.current&&!videoRef.current.paused)pulse();},4000);return()=>window.clearInterval(timer);},[src,token,lessonId,canSeek]);
 return <div ref={scopeRef}>
  <video ref={videoRef} controls controlsList="noplaybackrate" playsInline preload="metadata" className="w-full aspect-video rounded-xl bg-[#20364C]" src={src} aria-label={label}
   onPlay={()=>void start()} onEnded={()=>{setChecking(true);pulse(true);}} onError={onError}/>
  <p className="text-xs text-slate-500 mt-2">{canSeek?'DEV: avanço pela barra permitido. Assista até o final para liberar a atividade.':'Assista até o fim para liberar a atividade. Não é permitido avançar pela barra. Trocar de aba, sair do player ou pausar faz o vídeo voltar ao início.'}</p>
  {checking&&<p role="status" className="text-sm text-slate-600 mt-3">Confirmando conclusão do vídeo…</p>}
  {message&&<p role="status" className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3 mt-3">{message}</p>}
 </div>;
}
