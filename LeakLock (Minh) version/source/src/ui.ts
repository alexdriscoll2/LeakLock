import { formatContent, parseContent } from './filter-content';
import { disclosureMotion } from './motion';
import { type Preferences, type Rule, type Status } from './model';
import { readPreferences, validatePreferences } from './preferences';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const motionStyle=document.createElement('style');motionStyle.textContent=disclosureMotion;document.head.append(motionStyle);
let prefs:Preferences;
let feedbackTimer:ReturnType<typeof setTimeout>;
function feedback(message:string){clearTimeout(feedbackTimer);$('feedback').textContent=message;feedbackTimer=setTimeout(()=>{$('feedback').textContent='';},6000);}
async function mutate(message:unknown){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error || 'Could not save settings');prefs=await readPreferences();}
async function save(){try {await mutate({type:'save',preferences:validatePreferences(prefs)});render();feedback('Saved.');} catch(error){prefs=await readPreferences();render();throw error;}}
function run(fn:()=>Promise<void>){void fn().catch((e:Error)=>feedback(e.message));}
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
function render(){
  $('rule-count').textContent=prefs.enabled?`${prefs.rules.filter(r=>r.enabled).length} on`:'Paused';
  if(document.body.classList.contains('popup')) {
    const list=$('popup-rules');list.replaceChildren();
    for(const rule of prefs.rules.filter(r=>r.enabled)){const row=el('div');row.className='popup-rule';row.append(el('strong',rule.name),el('span',rule.action));list.append(row);}
    return;
  }
  $<HTMLInputElement>('enabled').checked=prefs.enabled;
  $<HTMLInputElement>('demo-controls').checked=!!prefs.demoControls;
  $('enabled-label').textContent=prefs.enabled?'On':'Off';
  $<HTMLSelectElement>('default-action').value=prefs.defaultAction;
  const list=$('rules');
  const opened=new Set(Array.from(list.querySelectorAll<HTMLDetailsElement>('.rule-card[open]')).map(card=>card.dataset.rule));
  list.replaceChildren();
  for(const rule of prefs.rules){const row=ruleEditor(rule);const card=row.querySelector<HTMLDetailsElement>('.rule-card')!;card.open=opened.has(rule.id);list.append(row);}
  for(const [id,keys] of [['allow-list',['allowedAuthors','allowedDomains']],['pause-list',['pausedSites']]] as const){
    const target=$(id);target.replaceChildren();
    for(const key of keys)for(const value of prefs[key]){
      const row=el('div');row.className='allowance';row.append(el('span',`${key==='allowedAuthors'?'Author':key==='allowedDomains'?'Domain':'Site'} · ${value}`));
      const remove=el('button','Remove');remove.onclick=()=>run(async()=>{prefs[key]=prefs[key].filter(v=>v!==value);await save();});row.append(remove);target.append(row);
    }
    if(!target.children.length)target.append(el('p',id==='allow-list'?'No allowances yet.':'No paused sites.'));
  }
}
function ruleEditor(rule:Rule){
  const row=el('div');row.className='rule-row';
  const quickToggle=el('input');quickToggle.type='checkbox';quickToggle.checked=rule.enabled;quickToggle.setAttribute('aria-label',`Enable ${rule.name}`);
  quickToggle.onchange=()=>run(async()=>{rule.enabled=quickToggle.checked;await save();});
  const card=el('details');card.className='rule-card';card.dataset.rule=rule.id;const summary=el('summary',rule.name);card.append(summary);
  const form=el('form');form.className='editor';form.setAttribute('aria-label',`Edit ${rule.name}`);
  const name=el('input');name.value=rule.name;name.required=true;name.maxLength=160;
  const content=el('textarea');content.value=formatContent(rule);content.required=true;content.rows=4;content.placeholder='Words or phrases to hide…';
  for(const [text,input] of [['Name',name],['Filter content',content]] as const){const label=el('label',text);label.append(input);form.append(label);}
  const actions=el('div');actions.className='row';const submit=el('button','Save');submit.className='primary';submit.type='submit';const remove=el('button','Delete');remove.type='button';remove.className='danger';remove.setAttribute('aria-label',`Delete ${rule.name}`);remove.onclick=()=>run(async()=>{prefs.rules=prefs.rules.filter(r=>r.id!==rule.id);await save();});actions.append(submit,remove);form.append(actions);
  form.onsubmit=event=>{event.preventDefault();run(async()=>{const parsed=parseContent(content.value);const updated={...rule,name:name.value.trim(),...parsed};if(!('contextTerms' in parsed))delete updated.contextTerms;prefs.rules=prefs.rules.map(r=>r.id===rule.id?updated:r);await save();});};card.append(form);row.append(quickToggle,card);return row;
}
async function initPopup(){
  $('options').onclick=()=>{void chrome.runtime.openOptionsPage();};
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id || !tab.url || !/^https?:/.test(tab.url)){ $('site-status').textContent='Open a website to start.';return; }
  const site=new URL(tab.url).hostname;$('site').textContent=site;
  const refresh=async()=>{
    const paused=!prefs.enabled || prefs.pausedSites.includes(site);
    const button=$<HTMLButtonElement>('pause');button.disabled=!prefs.enabled;button.textContent=!prefs.enabled?'Filtering off':prefs.pausedSites.includes(site)?'Resume this site':'Pause this site';
    try {
      const status=await chrome.tabs.sendMessage(tab.id!,{type:'status'}) as Status;
      $('hidden').textContent=String(paused?0:status.hidden ?? 0);$('scanned').textContent=String(status.scanned ?? 0);
      $('site-status').textContent=!prefs.enabled?'Turn on Leak Lock in Your filters.':paused?'Paused on this site.':status.scanned===0?'No supported items found.':status.insufficient?`${status.insufficient} ${status.insufficient===1?'item needs':'items need'} more text.`:'Filtering on.';
    } catch {$('site-status').textContent='Refresh this tab to start.';}
  };
  $('pause').onclick=()=>run(async()=>{await mutate({type:'toggleSite',site});await refresh();feedback(prefs.pausedSites.includes(site)?'Site paused.':'Filtering resumed.');});
  await refresh();
  const refreshTimer=setInterval(()=>{void refresh();},700);
  window.addEventListener('pagehide',()=>clearInterval(refreshTimer),{once:true});
}
function initOptions(){
  $('demo-controls').onchange=()=>run(async()=>{prefs.demoControls=$<HTMLInputElement>('demo-controls').checked;await save();});
  $('enabled').onchange=()=>run(async()=>{prefs.enabled=$<HTMLInputElement>('enabled').checked;await save();});
  $('default-action').onchange=()=>run(async()=>{prefs.defaultAction=$<HTMLSelectElement>('default-action').value as 'blur'|'collapse';await save();});
  $('add-rule').onsubmit=event=>{event.preventDefault();run(async()=>{
    const content=parseContent($<HTMLTextAreaElement>('rule-terms').value);
    const name=$<HTMLInputElement>('rule-name').value.trim() || content.terms.slice(0,2).join(', ').slice(0,80);
    const rule:Rule={id:crypto.randomUUID(),name,...content,enabled:true,action:prefs.defaultAction};
    validatePreferences({...prefs,rules:[...prefs.rules,rule]});prefs.rules.push(rule);await save();($('add-rule') as HTMLFormElement).reset();($('custom-filter') as HTMLDetailsElement).open=false;
  });};
  $('export').onclick=()=>{const blob=new Blob([JSON.stringify(prefs,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download='leak-lock-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('import').onchange=()=>run(async()=>{const file=$<HTMLInputElement>('import').files?.[0];if(!file)return;if(file.size>1000000)throw new Error('Settings file must be under 1 MB');const imported=validatePreferences(JSON.parse(await file.text()));await mutate({type:'save',preferences:imported});render();feedback('Imported settings.');});
}
run(async()=>{prefs=await readPreferences();render();if(document.body.classList.contains('popup'))await initPopup();else initOptions();});

chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.preferences)run(async()=>{prefs=await readPreferences();render();});});
