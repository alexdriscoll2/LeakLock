import { DEFAULTS, defaultRules, type Preferences } from './model';
export function validatePreferences(value: unknown): Preferences {
  if(!value || typeof value!=='object') throw new Error('Invalid preferences');
  const p=value as Preferences;
  if(p.demoControls!==undefined && typeof p.demoControls!=='boolean')throw new Error('Invalid demo controls setting');
  if(typeof p.enabled!=='boolean' || !['blur','collapse'].includes(p.defaultAction) || !Array.isArray(p.rules) || p.rules.length>100) throw new Error('Invalid settings or too many rules (maximum 100)');
  for(const key of ['pausedSites','allowedAuthors','allowedDomains'] as const) if(!Array.isArray(p[key]) || p[key].some(s=>typeof s!=='string' || s.length>500)) throw new Error(`Invalid ${key}`);
  for(const r of p.rules) if(!r || typeof r.id!=='string' || typeof r.name!=='string' || !r.name.trim() || r.name.length>160 || typeof r.enabled!=='boolean' || !['blur','collapse'].includes(r.action) || !Array.isArray(r.terms) || !r.terms.length || !Array.isArray(r.except) || [...r.terms,...r.except].some(t=>typeof t!=='string'|| !t.trim() || t.length>200) || r.terms.length>100 || r.except.length>100) throw new Error('Rules need a name and 1–100 phrases, each at most 200 characters');
  for(const r of p.rules)if(r.contextTerms!==undefined && (!Array.isArray(r.contextTerms) || r.contextTerms.length>100 || r.contextTerms.some(t=>typeof t!=='string' || !t.trim() || t.length>200)))throw new Error('Invalid context phrases');
  return {...structuredClone(p),demoControls:p.demoControls ?? false};
}
export async function readPreferences(): Promise<Preferences> {
  const data=await chrome.storage.local.get('preferences');
  if(!data.preferences) return structuredClone(DEFAULTS);
  const p=validatePreferences(data.preferences);
  if((p.presetsVersion ?? 0)<1) {
    // Preserve older preset instances and edits; add only categories not already present.
    for(const rule of defaultRules()) if(!p.rules.some(r=>r.id===rule.id || r.name===rule.name) && p.rules.length<100)p.rules.push(rule);
    p.presetsVersion=1;
  }
  if((p.presetsVersion ?? 0)<2){
    const golf=defaultRules().find(r=>r.id==='preset-golf')!;
    if(!p.rules.some(r=>r.id===golf.id || r.name===golf.name) && p.rules.length<100)p.rules.push(golf);
    p.presetsVersion=2;
  }
  if((p.presetsVersion ?? 0)<3){
    const dune=defaultRules().find(r=>r.id==='preset-dune')!;
    if(!p.rules.some(r=>r.id===dune.id || r.name===dune.name) && p.rules.length<100)p.rules.push(dune);
    p.presetsVersion=3;
  }
  return p;
}
