import { FilterEngine } from '../src/engine';
import { readPreferences } from '../src/preferences';
async function send(message:unknown){const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw new Error(result?.error || 'Could not save');}
void (async()=>{
const engine=new FilterEngine({...await readPreferences(),demoControls:true},async(kind,value)=>send(kind==='author'?{type:'allowAuthor',author:value}:{type:'allowDomain',domain:value}),document,(ruleId,phrase)=>send({type:'learnRule',ruleId,phrase}));
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.preferences)void readPreferences().then(p=>engine.update({...p,demoControls:true}));});
document.getElementById('add-similar')!.onclick=()=>{const card=document.createElement('article');card.innerHTML='<h2>Jackpot club: a new offer</h2><p>Another invitation from the jackpot club. This post was added dynamically.</p>';document.getElementById('feed')!.append(card);};
document.getElementById('reset-demo')!.onclick=()=>{localStorage.removeItem('leak-lock-ui-preview');location.reload();};
window.addEventListener('pagehide',()=>engine.destroy());

})();
