import type { Rule } from './model';
const items=(value:string)=>value.split(',').map(s=>s.trim()).filter(Boolean);
/** One content field round-trips existing exceptions/context without extra controls. */
export function formatContent(rule:Pick<Rule,'terms'|'except'|'contextTerms'>):string {
  return [rule.terms.join(', '),...(rule.except.length?[`Keep: ${rule.except.join(', ')}`]:[]),...(rule.contextTerms?.length?[`Only with: ${rule.contextTerms.join(', ')}`]:[])].join('\n');
}
export function parseContent(content:string):Pick<Rule,'terms'|'except'|'contextTerms'> {
  const terms:string[]=[],except:string[]=[],context:string[]=[];
  for(const raw of content.split('\n')) {
    const line=raw.trim();if(!line)continue;
    const keep=/^keep\s*:\s*(.*)$/i.exec(line),only=/^only with\s*:\s*(.*)$/i.exec(line),hide=/^hide\s*:\s*(.*)$/i.exec(line);
    if(keep)except.push(...items(keep[1]));
    else if(only)context.push(...items(only[1]));
    else terms.push(...items(hide?.[1] ?? line));
  }
  if(!terms.length)throw new Error('Add filter content to hide.');
  const unique=(values:string[])=>[...new Set(values)];
  return {terms:unique(terms),except:unique(except),...(context.length?{contextTerms:unique(context)}:{})};
}
