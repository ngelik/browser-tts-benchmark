import {recordingUrl} from './links.mjs';
const model=document.querySelector('#model'),backend=document.querySelector('#backend'),main=document.querySelector('#samples'),status=document.querySelector('#status');
const repo='https://github.com/ngelik/browser-tts-benchmark/blob/main/';
try{
 const {entries}=await fetch('manifest.json').then(r=>{if(!r.ok)throw new Error('Audio manifest unavailable');return r.json();});
 for(const name of [...new Set(entries.map(e=>e.model))]){const o=document.createElement('option');o.textContent=name;model.append(o);}
 let selected=new URL(location.href).searchParams.get('sample');
 const requested=entries.find(a=>a.clip.path.split('/').at(-1)===selected);
 if(requested){model.value=requested.model;backend.value=requested.backend;}
 else if(selected){selected=null;status.textContent='That recording was not found. Showing all recordings.';}
 function render(){
  main.querySelectorAll('audio').forEach(a=>a.pause());main.replaceChildren();
  const visible=entries.filter(a=>(!selected||a.clip.path.split('/').at(-1)===selected)&&(!model.value||a.model===model.value)&&(!backend.value||a.backend===backend.value));
  if(!status.textContent)status.textContent=visible.length+' recording'+(visible.length===1?'':'s')+(selected?' selected. Use “Show all recordings” to compare more.':'.');
  for(const a of visible){
   if(!/^audio\/samples\/[a-z0-9._-]+\.wav$/.test(a.clip.path)||!a.full.url.startsWith('https://github.com/ngelik/browser-tts-benchmark/releases/download/'))throw new Error('Unexpected recording URL');
   const card=document.createElement('article'),h=document.createElement('h2'),p=document.createElement('p'),audio=document.createElement('audio'),links=document.createElement('p'),note=document.createElement('small');
   h.textContent=a.model+' · '+a.backend;p.textContent='Voice: '+a.voice+' · English · scored repetition '+a.trialIndex;audio.controls=true;audio.preload='none';audio.src='../'+a.clip.path;audio.setAttribute('aria-label',a.model+' '+a.backend+' recording');
   audio.addEventListener('play',()=>main.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();}));
   const addLink=(text,url)=>{if(links.childNodes.length)links.append(' · ');const link=document.createElement('a');link.textContent=text;link.href=url;links.append(link);};
   addLink('Full article WAV',a.full.url);addLink('Run receipt',repo+'results/'+encodeURIComponent(a.resultId)+'/summary.md');addLink('Link to this recording',recordingUrl(a,location.href));
   for(const [i,u]of a.sourceUrls.entries()){const parsed=new URL(u);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error('Unexpected attribution URL');addLink('Source '+(i+1),parsed.href);}
   note.textContent=a.attribution+' Model terms: '+a.modelTerms;card.append(h,p,audio,links,note);main.append(card);
  }
 }
 function filtersChanged(){selected=null;const url=new URL(location.href);url.search='';history.replaceState(null,'',url);status.textContent='';render();}
 model.addEventListener('change',filtersChanged);backend.addEventListener('change',filtersChanged);
 document.querySelector('#reset').addEventListener('click',()=>{model.value='';backend.value='';filtersChanged();});render();
}catch(error){main.textContent='Unable to load recordings. Please reload this page or open the benchmark results linked above.';status.textContent='Playback unavailable.';console.error(error);}
