import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
fs.writeFileSync('/tmp/digitale-video-guard-test-module.mjs',ts.transpileModule(fs.readFileSync('src/pages/training/trainingVideoGuard.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
const {attachTrainingVideoGuard}=await import('file:///tmp/digitale-video-guard-test-module.mjs');
class Video extends EventTarget{currentTime=0;duration=120;paused=true;ended=false;play(){this.paused=false;this.dispatchEvent(new Event('play'));}pause(){if(!this.paused){this.paused=true;this.dispatchEvent(new Event('pause'));}}}
function setup(){const video=new Video(),win=new EventTarget(),doc=new EventTarget();doc.hidden=false;doc.fullscreenElement=null;const scope={contains:x=>x===video||x===scope};let observer,resets=0;class Observer{constructor(cb){this.cb=cb;observer=this;}observe(){}disconnect(){this.closed=true;}tick(r){if(!this.closed)this.cb([{target:video,isIntersecting:r>0,intersectionRatio:r}]);}}const dispose=attachTrainingVideoGuard(video,scope,()=>resets++,{window:win,document:doc,Observer});return{video,win,doc,scope,dispose,observer,get resets(){return resets;},start(){video.play();video.currentTime=42;}};}
let count=0;function test(name,fn){const s=setup();fn(s);s.dispose();count++;console.log('OK '+name);}
function reset(s){assert.equal(s.video.currentTime,0);assert.equal(s.video.paused,true);assert.equal(s.resets,1);}
test('aba oculta e retorno sem autoplay',s=>{s.start();s.doc.hidden=true;s.doc.dispatchEvent(new Event('visibilitychange'));reset(s);s.doc.hidden=false;s.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(s.video.paused,true);});
test('perda de foco',s=>{s.start();s.win.dispatchEvent(new Event('blur'));reset(s);});
test('pausa manual',s=>{s.start();s.video.pause();reset(s);});
test('clique fora',s=>{s.start();s.doc.dispatchEvent(new Event('pointerdown'));reset(s);});
test('clique dentro',s=>{s.start();const e=new Event('pointerdown');e.composedPath=()=>[s.video,s.scope];s.doc.dispatchEvent(e);assert.equal(s.video.paused,false);assert.equal(s.resets,0);});
test('rolagem para fora',s=>{s.start();s.observer.tick(.24);reset(s);});
test('reprodução normal sem cliques',s=>{s.start();s.observer.tick(.75);assert.equal(s.video.currentTime,42);assert.equal(s.video.paused,false);});
test('tela cheia',s=>{s.start();s.doc.fullscreenElement={contains:x=>x===s.video};s.observer.tick(0);assert.equal(s.video.paused,false);});
test('fim natural preservado',s=>{s.start();s.video.currentTime=120;s.video.ended=true;s.video.pause();s.video.dispatchEvent(new Event('ended'));s.win.dispatchEvent(new Event('blur'));assert.equal(s.video.currentTime,120);assert.equal(s.resets,0);});
test('saída da página',s=>{s.start();s.win.dispatchEvent(new Event('pagehide'));reset(s);});
test('desmontagem e remoção dos listeners',s=>{s.start();s.dispose();assert.equal(s.video.currentTime,0);assert.equal(s.video.paused,true);s.video.play();s.video.currentTime=50;s.doc.hidden=true;s.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(s.video.currentTime,50);assert.equal(s.resets,0);});
test('play com aba oculta',s=>{s.doc.hidden=true;s.video.play();reset(s);});
console.log(count+' verificações passaram.');
