import type { ContentData, Preferences } from './model';
import { validatePreferences } from './preferences';

/** An explicit example teaches an editable phrase, never an opaque semantic label. */
export function learnRule(preferences:Preferences,ruleId:string,phrase:string):Preferences {
  const p=validatePreferences(preferences);
  if(typeof ruleId!=='string' || typeof phrase!=='string')throw new Error('Choose a filter and enter a phrase');
  const term=phrase.normalize('NFKC').replace(/\s+/g,' ').trim();
  if(!term || term.length>200)throw new Error('Enter a phrase of 1–200 characters');
  const rule=p.rules.find(r=>r.id===ruleId);
  if(!rule)throw new Error('This filter was removed. Choose another filter.');
  if(!rule.terms.some(t=>t.normalize('NFKC').trim().toLocaleLowerCase()===term.toLocaleLowerCase()))rule.terms.push(term);
  rule.enabled=true;
  return validatePreferences(p);
}
export function suggestPhrase(item:ContentData):string {
  const text=(item.title || item.caption || item.body || item.labels.join(' ')).replace(/\s+/g,' ').trim();
  // Short, inspectable suggestion; the user chooses the actual matching phrase.
  return text.split(/\s+/).slice(0,8).join(' ').slice(0,200);
}
