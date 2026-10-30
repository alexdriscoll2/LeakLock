import { FilterEngine } from './engine';
import { readPreferences } from './preferences';
let engine:FilterEngine|undefined;
const learn=async(ruleId:string,phrase:string)=>{const result=await chrome.runtime.sendMessage({type:'learnRule',ruleId,phrase});if(!result?.ok)throw new Error(result?.error || 'Could not save phrase');};
void readPreferences().then(prefs=>{
  engine=new FilterEngine(prefs,async(kind,value)=>{
    const result=await chrome.runtime.sendMessage(kind==='author'?{type:'allowAuthor',author:value}:{type:'allowDomain',domain:value});
    if(!result?.ok)throw new Error(result?.error || 'Settings unavailable');
  },document,learn);
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.preferences) void readPreferences().then(p=>engine?.update(p));});
chrome.runtime.onMessage.addListener((message,_sender,reply)=>{if(message.type==='status')reply(engine?.status ?? {loading:true});});
window.addEventListener('pagehide',()=>engine?.destroy());
window.addEventListener('pageshow',event=>{if(event.persisted)void readPreferences().then(p=>{engine?.destroy();engine=new FilterEngine(p,async(kind,value)=>{const r=await chrome.runtime.sendMessage(kind==='author'?{type:'allowAuthor',author:value}:{type:'allowDomain',domain:value});if(!r?.ok)throw new Error(r?.error);},document,learn);});});
