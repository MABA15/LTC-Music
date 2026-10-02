(() => {
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const uid = () => Math.random().toString(36).slice(2,9);
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const COLORS = ['#7ee787','#56b6c2','#d7ba7d','#c586c0','#9cdcfe','#ce9178','#b5cea8','#d16969'];
const SCALE_MAJOR = [0,2,4,5,7,9,11];
const keyNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const PRESETS = {
  'Guitare classique sèche': {wave:'triangle',partials:[[1,1],[2,.20],[3,.05]],attack:.008,release:1.0,filter:9000},
  'Guitare nylon douce': {wave:'triangle',partials:[[1,1],[2,.16],[3,.04]],attack:.012,release:1.5,filter:7000},
  'Piano feutré': {wave:'sine',partials:[[1,1],[2,.18],[3,.05]],attack:.025,release:2.4,filter:6500},
  'Piano sec': {wave:'sine',partials:[[1,1],[2,.25],[3,.08]],attack:.008,release:1.0,filter:9000},
  'Rhodes': {wave:'sine',partials:[[1,1],[2,.12],[4,.025]],attack:.02,release:1.9,filter:8500},
  'Kalimba': {wave:'sine',partials:[[1,1],[2,.09],[3,.02]],attack:.004,release:.8,filter:10000},
  'Marimba': {wave:'sine',partials:[[1,1],[2,.06]],attack:.006,release:.7,filter:7500},
  'Mandoline douce': {wave:'triangle',partials:[[1,1],[2,.12],[3,.03]],attack:.004,release:.85,filter:9500},
  'Harpe': {wave:'triangle',partials:[[1,1],[2,.10],[3,.025]],attack:.006,release:1.7,filter:11000},
  'Pizzicato': {wave:'triangle',partials:[[1,1],[2,.08]],attack:.005,release:.45,filter:8500},
  'Basse ronde': {wave:'sine',partials:[[1,1],[2,.10]],attack:.02,release:1.3,filter:2600},
  'Pad chaud': {wave:'sine',partials:[[1,1],[2,.08],[3,.02]],attack:.35,release:3.8,filter:5200},
  'Pad aérien': {wave:'sine',partials:[[1,1],[2,.04]],attack:.65,release:4.5,filter:7000},
  'Triangle doux': {wave:'sine',partials:[[1,1],[2,.04]],attack:.01,release:2.0,filter:12000},
  'Percussion bois': {percussion:'wood',attack:.002,release:.25,filter:5500},
  'Hand drum': {percussion:'drum',attack:.002,release:.35,filter:2500},
  'Shaker doux': {percussion:'shaker',attack:.001,release:.12,filter:12000}
};

const defaultTracks = [
  mkTrack('Guitare','Guitare classique sèche',0),
  mkTrack('Rhodes','Rhodes',1),
  mkTrack('Pad','Pad chaud',2),
  mkTrack('Basse','Basse ronde',3)
];
function mkTrack(name,instrument,colorIndex){
  const p = PRESETS[instrument];
  return {id:uid(),name,instrument,color:COLORS[colorIndex%COLORS.length],volume:.75,pan:0,attack:p.attack,release:p.release,reverb:.15,filter:p.filter,mute:false,notes:[]};
}

const state = {
  bpm:76, key:0, duration:90, grid:.5, zoom:58, loop:true,
  tracks:defaultTracks, selectedTrackId:defaultTracks[0].id, selectedNoteId:null,
  chords:[], drums:{'Hand drum':new Set([0,8]),'Percussion bois':new Set([4,12]),'Shaker doux':new Set([2,6,10,14])},
  history:[], future:[], humanize:.25,
  playing:false, startAudioTime:0, playTimer:null, playheadRAF:null, audioCtx:null, nodes:[]
};

const els = {
  bpm:$('#bpm'), key:$('#keySelect'), duration:$('#durationSelect'), grid:$('#gridSelect'), zoom:$('#zoomSlider'),
  tracks:$('#tracks'), roll:$('#rollCanvas'), rollScroller:$('#rollScroller'), keyboard:$('#keyboard'),
  instrument:$('#instrumentSelect'), volume:$('#volume'), pan:$('#pan'), attack:$('#attack'), release:$('#release'), reverb:$('#reverb'), filter:$('#filter'), velocity:$('#velocity'),
  play:$('#playBtn'), stop:$('#stopBtn'), loop:$('#loopBtn'), humanize:$('#humanizeBtn'), chordRoot:$('#chordRoot'), chordType:$('#chordType'), chords:$('#chordsList'),
  drums:$('#drumGrid'), mixer:$('#mixer'), workspace:$('.workspace'), fileInput:$('#fileInput')
};

function init(){
  for (let i=0;i<12;i++){ els.key.add(new Option(keyNames[i]+' majeur',i)); els.chordRoot.add(new Option(keyNames[i],i)); }
  Object.keys(PRESETS).forEach(n=>els.instrument.add(new Option(n,n)));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  bindUI();
  renderAll();
}

function bindUI(){
  els.bpm.onchange = () => mutate(()=>state.bpm=clamp(+els.bpm.value||76,40,160));
  els.key.onchange = () => { state.key=+els.key.value; renderRoll(); };
  els.duration.onchange = () => { mutate(()=>state.duration=+els.duration.value); renderRoll(); };
  els.grid.onchange = () => state.grid=+els.grid.value;
  els.zoom.oninput = () => { state.zoom=+els.zoom.value; renderRoll(); };
  $('#addTrackBtn').onclick=()=>{ if(state.tracks.length>=8) return toast('Maximum 8 pistes en V0.1'); mutate(()=>{const i=state.tracks.length; const t=mkTrack('Piste '+(i+1),'Piano feutré',i); state.tracks.push(t); state.selectedTrackId=t.id;}); renderAll(); };
  $('#clearBtn').onclick=()=>{ if(confirm('Effacer toutes les notes et le pattern rythmique ?')){ mutate(()=>{state.tracks.forEach(t=>t.notes=[]); Object.values(state.drums).forEach(s=>s.clear());}); renderAll(); }};
  els.play.onclick=play;
  els.stop.onclick=stop;
  els.loop.onclick=()=>{state.loop=!state.loop; els.loop.classList.toggle('active',state.loop)};
  $('#undoBtn').onclick=undo; $('#redoBtn').onclick=redo;
  els.humanize.onclick=()=>{ state.humanize=state.humanize===.25?.4:state.humanize===.4?.1:.25; els.humanize.textContent='Humaniser '+Math.round(state.humanize*100)+'%'; };
  $('#saveBtn').onclick=saveLocal; $('#loadBtn').onclick=loadLocal;
  $('#exportProjectBtn').onclick=exportProject; $('#importProjectBtn').onclick=()=>els.fileInput.click(); els.fileInput.onchange=importProject;
  $('#exportWavBtn').onclick=exportWav;
  $('#duplicateNoteBtn').onclick=duplicateSelectedNote; $('#deleteNoteBtn').onclick=deleteSelectedNote;
  els.instrument.onchange=()=>updateTrackProp('instrument',els.instrument.value,true);
  ['volume','pan','attack','release','reverb','filter'].forEach(k=>els[k].oninput=()=>updateTrackProp(k,+els[k].value,false));
  $('#addChordBtn').onclick=()=>{ mutate(()=>state.chords.push({id:uid(),beat:0,root:+els.chordRoot.value,type:els.chordType.value})); renderChords(); };
  $$('.mode').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
  $$('.mobile-tabs button').forEach(b=>b.onclick=()=>switchMobile(b.dataset.mobile,b));
  window.addEventListener('resize',()=>{renderKeyboard();renderRoll();});
  bindRollPointer();
  els.rollScroller.addEventListener('scroll',()=>{ els.keyboard.scrollTop=els.rollScroller.scrollTop; });
}

function snapshot(){
  return JSON.stringify({bpm:state.bpm,key:state.key,duration:state.duration,grid:state.grid,zoom:state.zoom,tracks:state.tracks,chords:state.chords,drums:Object.fromEntries(Object.entries(state.drums).map(([k,v])=>[k,[...v]]))});
}
function restore(s){
  const p=typeof s==='string'?JSON.parse(s):s;
  state.bpm=p.bpm||76; state.key=p.key||0; state.duration=p.duration||90; state.grid=p.grid||.5; state.zoom=p.zoom||58;
  state.tracks=(p.tracks||[]).map(t=>({...t,id:t.id||uid(),notes:(t.notes||[]).map(n=>({...n,id:n.id||uid()}))}));
  state.selectedTrackId=state.tracks[0]?.id||null; state.selectedNoteId=null; state.chords=p.chords||[];
  state.drums=Object.fromEntries(Object.entries(p.drums||{}).map(([k,v])=>[k,new Set(v)]));
  ['Hand drum','Percussion bois','Shaker doux'].forEach(k=>state.drums[k]||(state.drums[k]=new Set()));
  els.bpm.value=state.bpm; els.key.value=state.key; els.duration.value=state.duration; els.grid.value=state.grid; els.zoom.value=state.zoom; renderAll();
}
function mutate(fn){ state.history.push(snapshot()); if(state.history.length>60) state.history.shift(); state.future=[]; fn(); }
function undo(){ if(!state.history.length)return; state.future.push(snapshot()); restore(state.history.pop()); }
function redo(){ if(!state.future.length)return; state.history.push(snapshot()); restore(state.future.pop()); }

function currentTrack(){ return state.tracks.find(t=>t.id===state.selectedTrackId); }
function currentNote(){ const t=currentTrack(); return t?.notes.find(n=>n.id===state.selectedNoteId); }
function updateTrackProp(k,v,rerender){ const t=currentTrack(); if(!t)return; t[k]=v; if(k==='instrument'){const p=PRESETS[v]; t.attack=p.attack;t.release=p.release;t.filter=p.filter;} if(rerender)renderAll(); else {renderTracks();renderMixer();} }

function renderAll(){ renderTracks(); renderKeyboard(); renderRoll(); renderInspector(); renderDrums(); renderMixer(); renderChords(); }
function renderTracks(){
  els.tracks.innerHTML='';
  state.tracks.forEach((t,i)=>{
    const d=document.createElement('div'); d.className='track'+(t.id===state.selectedTrackId?' active':'');
    d.innerHTML=`<span class="swatch" style="background:${t.color}"></span><div class="track-name"><strong>${esc(t.name)}</strong><small>${esc(t.instrument)}</small></div><button title="Mute">${t.mute?'M':'●'}</button>`;
    d.onclick=e=>{ if(e.target.tagName==='BUTTON'){t.mute=!t.mute;renderTracks();return;} state.selectedTrackId=t.id;state.selectedNoteId=null;renderAll(); };
    d.querySelector('strong').ondblclick=e=>{e.stopPropagation(); const n=prompt('Nom de la piste',t.name); if(n){t.name=n;renderTracks();renderMixer();}};
    els.tracks.appendChild(d);
  });
}
function renderInspector(){
  const t=currentTrack(); if(!t)return;
  els.instrument.value=t.instrument; els.volume.value=t.volume; els.pan.value=t.pan; els.attack.value=t.attack; els.release.value=t.release; els.reverb.value=t.reverb; els.filter.value=t.filter;
  const n=currentNote(); if(n) els.velocity.value=n.velocity;
  els.velocity.oninput=()=>{const n=currentNote();if(n){n.velocity=+els.velocity.value;renderRoll();}};
}
function renderKeyboard(){
  els.keyboard.innerHTML='';
  for(let midi=83;midi>=48;midi--){ const d=document.createElement('div'); d.className='key'+([1,3,6,8,10].includes(midi%12)?' black':''); d.textContent=NOTE_NAMES[midi%12]+(Math.floor(midi/12)-1); els.keyboard.appendChild(d); }
}

function beatWidth(){return state.zoom;}
function totalBeats(){return state.duration*state.bpm/60;}
function renderRoll(){
  const c=els.roll, ctx=c.getContext('2d'); const bw=beatWidth(); const w=Math.max(els.rollScroller.clientWidth,totalBeats()*bw); const h=36*28;
  c.width=Math.ceil(w*devicePixelRatio); c.height=Math.ceil(h*devicePixelRatio); c.style.width=w+'px';c.style.height=h+'px';ctx.scale(devicePixelRatio,devicePixelRatio);
  ctx.fillStyle='#10141a';ctx.fillRect(0,0,w,h);
  const keyRoot=state.key; for(let r=0;r<36;r++){const midi=83-r; const inScale=SCALE_MAJOR.includes((midi-keyRoot+120)%12);ctx.fillStyle=inScale?'#141b20':'#101419';ctx.fillRect(0,r*28,w,28);ctx.strokeStyle='#252c35';ctx.beginPath();ctx.moveTo(0,(r+1)*28+.5);ctx.lineTo(w,(r+1)*28+.5);ctx.stroke();}
  for(let b=0;b<=Math.ceil(totalBeats());b++){const x=b*bw+.5;ctx.strokeStyle=b%4===0?'#46505f':'#29313b';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke(); if(b%4===0){ctx.fillStyle='#778395';ctx.font='10px sans-serif';ctx.fillText(String(Math.floor(b/4)+1),x+4,11);}}
  const t=currentTrack(); if(t){ t.notes.forEach(n=>drawNote(ctx,n,t,w)); }
  if(state.playing){ const x=currentPlayBeat()*bw;ctx.strokeStyle='#7ee787';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke(); }
}
function drawNote(ctx,n,t){ const bw=beatWidth(); const x=n.beat*bw; const y=(83-n.midi)*28+3; const ww=Math.max(8,n.dur*bw-3); const hh=22; ctx.fillStyle=n.id===state.selectedNoteId?'#ffffff':t.color;ctx.globalAlpha=.92;roundRect(ctx,x+1,y,ww,hh,5,true);ctx.globalAlpha=1;ctx.fillStyle='#0d1215';ctx.fillRect(x+ww-5,y+3,3,hh-6); }
function roundRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill)ctx.fill();}

let gesture=null;
function bindRollPointer(){
  const c=els.roll;
  c.addEventListener('pointerdown',e=>{
    c.setPointerCapture(e.pointerId); const pt=canvasPoint(e); const hit=hitNote(pt.x,pt.y); const t=currentTrack(); if(!t)return;
    if(hit){ state.selectedNoteId=hit.id; const right=hit.beat*beatWidth()+hit.dur*beatWidth(); gesture={type:Math.abs(pt.x-right)<14?'resize':'move',id:hit.id,startX:pt.x,startY:pt.y,origBeat:hit.beat,origDur:hit.dur,origMidi:hit.midi,moved:false,longTimer:setTimeout(()=>{if(!gesture?.moved){mutate(()=>t.notes=t.notes.filter(n=>n.id!==hit.id));state.selectedNoteId=null;gesture=null;renderRoll();renderInspector();toast('Note supprimée');}},650)}; renderInspector();renderRoll();
    } else { const beat=snap(pt.x/beatWidth()); const midi=clamp(83-Math.floor(pt.y/28),48,83); mutate(()=>{const n={id:uid(),beat,dur:Math.max(state.grid,1),midi,velocity:+els.velocity.value||.72};t.notes.push(n);state.selectedNoteId=n.id;}); renderRoll();renderInspector(); }
  });
  c.addEventListener('pointermove',e=>{ if(!gesture)return; const pt=canvasPoint(e); if(Math.abs(pt.x-gesture.startX)>4||Math.abs(pt.y-gesture.startY)>4){gesture.moved=true;clearTimeout(gesture.longTimer);} const n=currentNote(); if(!n)return; if(gesture.type==='move'){n.beat=clamp(snap(gesture.origBeat+(pt.x-gesture.startX)/beatWidth()),0,totalBeats()-state.grid); n.midi=clamp(gesture.origMidi-Math.round((pt.y-gesture.startY)/28),48,83);} else n.dur=Math.max(state.grid,snap(gesture.origDur+(pt.x-gesture.startX)/beatWidth())); renderRoll(); });
  c.addEventListener('pointerup',()=>{if(gesture){clearTimeout(gesture.longTimer);gesture=null;}}); c.addEventListener('pointercancel',()=>{if(gesture){clearTimeout(gesture.longTimer);gesture=null;}});
}
function canvasPoint(e){const r=els.roll.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function hitNote(x,y){const t=currentTrack();if(!t)return null;return [...t.notes].reverse().find(n=>{const nx=n.beat*beatWidth(),ny=(83-n.midi)*28+3,nw=Math.max(8,n.dur*beatWidth()-3);return x>=nx&&x<=nx+nw&&y>=ny&&y<=ny+22;});}
function snap(v){return Math.round(v/state.grid)*state.grid;}
function duplicateSelectedNote(){const t=currentTrack(),n=currentNote();if(!t||!n)return;mutate(()=>{const d={...n,id:uid(),beat:clamp(n.beat+n.dur,0,totalBeats()-n.dur)};t.notes.push(d);state.selectedNoteId=d.id;});renderRoll();}
function deleteSelectedNote(){const t=currentTrack(),n=currentNote();if(!t||!n)return;mutate(()=>t.notes=t.notes.filter(x=>x.id!==n.id));state.selectedNoteId=null;renderRoll();}

function renderDrums(){
  els.drums.innerHTML='';
  Object.keys(state.drums).forEach(name=>{const row=document.createElement('div');row.className='drum-row';const lab=document.createElement('div');lab.className='drum-name';lab.textContent=name;row.appendChild(lab);for(let i=0;i<16;i++){const b=document.createElement('button');b.className='step'+(state.drums[name].has(i)?' active':'');b.textContent=(i%4===0)?String(i/4+1):'·';b.onclick=()=>{state.drums[name].has(i)?state.drums[name].delete(i):state.drums[name].add(i);renderDrums();};row.appendChild(b);}els.drums.appendChild(row);});
}
function renderMixer(){els.mixer.innerHTML='';state.tracks.forEach(t=>{const c=document.createElement('div');c.className='channel';c.innerHTML=`<strong>${esc(t.name)}</strong><label>Volume<input type="range" min="0" max="1" step=".01" value="${t.volume}"></label><label>Pan<input class="p" type="range" min="-1" max="1" step=".01" value="${t.pan}"></label>`;const [v,p]=c.querySelectorAll('input');v.oninput=()=>t.volume=+v.value;p.oninput=()=>t.pan=+p.value;els.mixer.appendChild(c);});}
function renderChords(){els.chords.innerHTML='';state.chords.forEach(ch=>{const d=document.createElement('span');d.className='chord-chip';d.innerHTML=`${NOTE_NAMES[ch.root]}${ch.type}<button>×</button>`;d.querySelector('button').onclick=()=>{state.chords=state.chords.filter(x=>x.id!==ch.id);renderChords();};els.chords.appendChild(d);});}

function switchMode(mode){$$('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$$('.view').forEach(v=>v.classList.remove('active'));$('#'+mode+'View').classList.add('active');if(mode==='mix')renderMixer();}
function switchMobile(m,b){els.workspace.classList.remove('show-tracks','show-inspector');if(m==='tracks')els.workspace.classList.add('show-tracks');if(m==='inspector')els.workspace.classList.add('show-inspector');$$('.mobile-tabs button').forEach(x=>x.classList.toggle('active',x===b));}

function ensureAudio(){ if(!state.audioCtx) state.audioCtx=new (window.AudioContext||window.webkitAudioContext)(); return state.audioCtx; }
function midiFreq(m){return 440*Math.pow(2,(m-69)/12);}
function makeImpulse(ctx,seconds=1.8,decay=2.5){const len=Math.floor(ctx.sampleRate*seconds),buf=ctx.createBuffer(2,len,ctx.sampleRate);for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay);}return buf;}
function scheduleProject(ctx,when,offline=false){
  const master=ctx.createGain();master.gain.value=.75;master.connect(ctx.destination);const impulse=makeImpulse(ctx);
  state.nodes=[];
  const secPerBeat=60/state.bpm;
  for(const t of state.tracks){if(t.mute)continue;const tg=ctx.createGain();tg.gain.value=t.volume;let out=tg;const pan=ctx.createStereoPanner?ctx.createStereoPanner():null;if(pan){pan.pan.value=t.pan;tg.connect(pan);out=pan;}const rev=ctx.createConvolver();rev.buffer=impulse;const rg=ctx.createGain();rg.gain.value=t.reverb;out.connect(master);out.connect(rev);rev.connect(rg);rg.connect(master);
    for(const n of t.notes){const jitter=offline?0:(Math.random()-.5)*.02*state.humanize;const vel=clamp(n.velocity*(1+(Math.random()-.5)*.12*state.humanize),.02,1);scheduleVoice(ctx,out,when+n.beat*secPerBeat+jitter,n.dur*secPerBeat,n.midi,vel,t);}
  }
  scheduleDrums(ctx,master,when,offline);
  return master;
}
function scheduleVoice(ctx,dest,start,dur,midi,vel,t){
  const p=PRESETS[t.instrument]||PRESETS['Piano feutré'];
  if(p.percussion){schedulePerc(ctx,dest,start,vel,p.percussion,t);return;}
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=t.filter||p.filter||12000;filter.connect(dest);
  const gain=ctx.createGain();gain.connect(filter);const a=Math.max(.001,t.attack),r=Math.max(.05,t.release);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,vel*.18),start+a);gain.gain.setValueAtTime(Math.max(.0002,vel*.18),start+Math.max(a,dur));gain.gain.exponentialRampToValueAtTime(.0001,start+dur+r);
  (p.partials||[[1,1]]).forEach(([ratio,amp])=>{const o=ctx.createOscillator();o.type=p.wave||'sine';o.frequency.value=midiFreq(midi)*ratio;const og=ctx.createGain();og.gain.value=amp;o.connect(og);og.connect(gain);o.start(start);o.stop(start+dur+r+.05);state.nodes.push(o);});
}
function schedulePerc(ctx,dest,start,vel,type,t={}){
  const g=ctx.createGain();g.connect(dest);g.gain.setValueAtTime(Math.max(.0001,vel*.2),start);g.gain.exponentialRampToValueAtTime(.0001,start+(type==='shaker'?.12:.32));
  if(type==='shaker'){const len=Math.floor(ctx.sampleRate*.14),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1);const src=ctx.createBufferSource();src.buffer=buf;const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=5000;src.connect(f);f.connect(g);src.start(start);}
  else {const o=ctx.createOscillator();o.type=type==='wood'?'triangle':'sine';o.frequency.setValueAtTime(type==='wood'?180:90,start);o.frequency.exponentialRampToValueAtTime(type==='wood'?120:55,start+.20);o.connect(g);o.start(start);o.stop(start+.35);}
}
function scheduleDrums(ctx,dest,when){const secPerBeat=60/state.bpm,stepBeat=.5,patternBeats=8,total=totalBeats();for(const [name,set] of Object.entries(state.drums)){const type=PRESETS[name]?.percussion||'wood';for(let base=0;base<total;base+=patternBeats){for(const s of set){const beat=base+s*stepBeat;if(beat<total)schedulePerc(ctx,dest,when+beat*secPerBeat,.55,type);}}}}

async function play(){ if(state.playing)return;const ctx=ensureAudio();await ctx.resume();state.playing=true;state.startAudioTime=ctx.currentTime+.06;scheduleProject(ctx,state.startAudioTime,false);const ms=state.duration*1000;state.playTimer=setTimeout(()=>{stop(false);if(state.loop)play();},ms);animatePlayhead(); }
function stop(reset=true){ if(state.playTimer)clearTimeout(state.playTimer);state.playTimer=null;state.nodes.forEach(n=>{try{n.stop()}catch{}});state.nodes=[];state.playing=false;if(state.playheadRAF)cancelAnimationFrame(state.playheadRAF);if(reset){$('#playheadLabel').textContent='00:00.0';renderRoll();} }
function currentPlaySeconds(){if(!state.playing||!state.audioCtx)return 0;return clamp(state.audioCtx.currentTime-state.startAudioTime,0,state.duration);}
function currentPlayBeat(){return currentPlaySeconds()*state.bpm/60;}
function animatePlayhead(){const s=currentPlaySeconds();$('#playheadLabel').textContent=fmtTime(s);renderRoll();const x=currentPlayBeat()*beatWidth();const left=els.rollScroller.scrollLeft,right=left+els.rollScroller.clientWidth;if(x>right-80)els.rollScroller.scrollLeft=x-120;if(state.playing)state.playheadRAF=requestAnimationFrame(animatePlayhead);}
function fmtTime(s){return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0')+'.'+Math.floor((s%1)*10);}

async function exportWav(){
  toast('Rendu WAV…'); const sr=44100,len=Math.ceil(state.duration*sr);const ctx=new OfflineAudioContext(2,len,sr);scheduleProject(ctx,.02,true);const buf=await ctx.startRendering();const wav=audioBufferToWav(buf);downloadBlob(new Blob([wav],{type:'audio/wav'}),'LTC_Music_'+Date.now()+'.wav');toast('WAV exporté');
}
function audioBufferToWav(buffer){const num=buffer.numberOfChannels,len=buffer.length*4+44,ab=new ArrayBuffer(len),v=new DataView(ab);let p=0;const str=s=>{for(let i=0;i<s.length;i++)v.setUint8(p++,s.charCodeAt(i));};str('RIFF');v.setUint32(p,36+buffer.length*num*2,true);p+=4;str('WAVEfmt ');v.setUint32(p,16,true);p+=4;v.setUint16(p,1,true);p+=2;v.setUint16(p,num,true);p+=2;v.setUint32(p,buffer.sampleRate,true);p+=4;v.setUint32(p,buffer.sampleRate*num*2,true);p+=4;v.setUint16(p,num*2,true);p+=2;v.setUint16(p,16,true);p+=2;str('data');v.setUint32(p,buffer.length*num*2,true);p+=4;const chans=[];for(let c=0;c<num;c++)chans.push(buffer.getChannelData(c));for(let i=0;i<buffer.length;i++)for(let c=0;c<num;c++){let s=clamp(chans[c][i],-1,1);v.setInt16(p,s<0?s*0x8000:s*0x7fff,true);p+=2;}return ab;}

function saveLocal(){localStorage.setItem('ltcMusicStudioProject',snapshot());toast('Projet sauvegardé sur cet appareil');}
function loadLocal(){const s=localStorage.getItem('ltcMusicStudioProject');if(!s)return toast('Aucune sauvegarde locale');restore(s);toast('Projet chargé');}
function exportProject(){downloadBlob(new Blob([snapshot()],{type:'application/json'}),'projet.ltcmusic');}
function importProject(e){const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{restore(r.result);toast('Projet importé');}catch{alert('Projet invalide');}};r.readAsText(f);e.target.value='';}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),1800);}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

init();
})();
