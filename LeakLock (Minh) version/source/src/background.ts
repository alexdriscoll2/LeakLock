import { readPreferences, validatePreferences } from './preferences';
import { learnRule } from './learning';
import type { Mutation } from './model';
let queue=Promise.resolve();
chrome.runtime.onInstalled.addListener(()=>{void readPreferences().then(p=>chrome.storage.local.set({preferences:p}));});
chrome.runtime.onMessage.addListener((message:Mutation,sender,reply)=>{
  if(sender.id!==chrome.runtime.id) return;
  queue=queue.then(async()=>{
    const p=await readPreferences();
    if(message.type==='save') {
      // Only extension UI can replace the full settings object.
      if(!sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('Settings must be saved from the extension UI');
      await chrome.storage.local.set({preferences:validatePreferences(message.preferences)});
    } else if(message.type==='learnRule') {
      await chrome.storage.local.set({preferences:learnRule(p,message.ruleId,message.phrase)});
    } else if(message.type==='toggleSite' || message.type==='allowDomain' || message.type==='allowAuthor') {
      const value=message.type==='toggleSite'?message.site:message.type==='allowDomain'?message.domain:message.author;
      if(typeof value!=='string' || !value || value.length>500) throw new Error('Invalid preference value');
      const key=message.type==='toggleSite'?'pausedSites':message.type==='allowDomain'?'allowedDomains':'allowedAuthors';
      if(message.type==='toggleSite' && p[key].includes(value)) p[key]=p[key].filter(s=>s!==value);
      else if(!p[key].includes(value)) p[key].push(value);
      await chrome.storage.local.set({preferences:validatePreferences(p)});
    } else throw new Error('Unknown request');
    reply({ok:true});
  }).catch((error:Error)=>{reply({ok:false,error:error.message});});
  return true;
});
