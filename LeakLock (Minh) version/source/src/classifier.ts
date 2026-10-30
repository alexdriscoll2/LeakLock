import { authorKey, type ContentData, type Decision, type Preferences } from './model';
export function contains(text: string, term: string): boolean {
  const escaped = term.normalize('NFKC').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return !!escaped && new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(text.normalize('NFKC'));
}
export function evaluate(item: ContentData, prefs: Preferences): Decision {
  if (prefs.allowedDomains.includes(item.domain ?? item.site) || (item.author && prefs.allowedAuthors.includes(authorKey(item.site,item.author)))) return {status:'allowed'};
  const community=item.community || '';
  // Community names are real topic context. Split separators/camel case for any
  // community, without maintaining topic-specific subreddit lists.
  const fields = {title:item.title,body:item.body,caption:item.caption,hashtags:item.hashtags.join(' '),labels:item.labels.join(' '),community:[community,community.replace(/[_-]+/g,' ').replace(/([\p{Ll}\p{N}])(\p{Lu})/gu,'$1 $2')].join(' ')};
  const all = Object.values(fields).join(' ');
  for (const rule of prefs.rules) {
    if (!rule.enabled || rule.except.some(term=>contains(all,term))) continue;
    const contextTerm=rule.contextTerms?.find(term=>contains(all,term));
    if(rule.contextTerms?.length && !contextTerm)continue;
    for (const [field,text] of Object.entries(fields)) {
      const term = rule.terms.find(term=>contains(text,term));
      if (term) return {status:'match',rule,field,term,...(contextTerm?{contextTerm}:{})};
    }
  }
  return {status:all.replace(/[^\p{L}\p{N}]/gu,'').length < 8?'insufficient':'clear'};
}
