import type { Adapter, ContentType, ContentUnit } from '../model';
const SELECTORS = {
  reddit:'shreddit-post, shreddit-comment, .thing.link, .thing.comment, [data-testid="post-container"], [data-testid="comment"]',
  forum:'[itemtype$="/DiscussionForumPosting"], [itemtype$="/Comment"], article[data-post-id], .topic-post, .Comment, [data-comment-id]',
  news:'article, [itemtype$="/NewsArticle"], [itemtype$="/Article"]',
  generic:'article, [role="article"]'
};
const query = (doc: Document, selector: string) => Array.from(doc.querySelectorAll<HTMLElement>(selector));
function owned(root: HTMLElement, candidates: Set<HTMLElement>): string {
  const clone = root.cloneNode(true) as HTMLElement;
  // Remove nested units by corresponding tree position, including same-tag posts/comments.
  const originals = Array.from(root.querySelectorAll('*'));
  const copies = Array.from(clone.querySelectorAll('*'));
  originals.forEach((node,i)=>{ if (candidates.has(node as HTMLElement)) copies[i]?.remove(); });
  clone.querySelectorAll('script,style,template,nav,time,a[href*="/reels/audio/"],button,input,textarea,select,quiet-web-controls,quiet-web-manual,video,audio,[hidden],[aria-hidden="true"],[slot="credit-bar"],[slot="repost-button"],[slot="post-stats-entry-point"]').forEach(el=>el.remove());
  const walker=root.ownerDocument.createTreeWalker(clone,NodeFilter.SHOW_TEXT),parts:string[]=[];
  while(walker.nextNode())parts.push(walker.currentNode.textContent || '');
  return parts.join(' ').replace(/\s+/g,' ').trim().slice(0,16000);
}
function ownElement(root: HTMLElement, selector: string, candidates: Set<HTMLElement>): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find(el=>{
    let parent=el.parentElement;
    while(parent && parent!==root) {if(candidates.has(parent)) return false; parent=parent.parentElement;}
    return true;
  });
}
function extract(root: HTMLElement, url: URL, candidates: Set<HTMLElement>, type: ContentType, metadata=root.matches('article')?root.querySelector('shreddit-post') || root:root): ContentUnit {
  const title = ownElement(root,'h1,h2,h3,[slot="title"],[data-testid="post-title"]',candidates)?.textContent?.trim() || metadata.getAttribute('post-title') || '';
  const authorEl = ownElement(root,'[rel="author"],[data-author],a[href*="/user/"],a[href*="/u/"],a[slot="authorName"]',candidates);
  const author = metadata.getAttribute('author') || metadata.getAttribute('data-author') || authorEl?.getAttribute('data-author') || authorEl?.textContent?.trim();
  const link = ownElement(root,'a[href*="/reel/"],a[href*="/p/"],a[href*="/reels/"]:not([href*="/reels/audio/"]),a[data-permalink],a[rel="bookmark"],a[href*="/comments/"]',candidates);
  let permalink = url.href;
  try {permalink = new URL(metadata.getAttribute('permalink') || metadata.getAttribute('data-permalink') || link?.getAttribute('href') || url.href,url).href;} catch { /* malformed site link */ }
  const body = owned(root,candidates);
  const labels = [root.getAttribute('aria-label'),...Array.from(root.querySelectorAll<HTMLElement>('video[aria-label],img[alt]')).filter(el=>{
    let p=el.parentElement; while(p && p!==root) {if(candidates.has(p)) return false;p=p.parentElement;}return true;
  }).map(el=>el.getAttribute('aria-label') || el.getAttribute('alt'))].filter((s):s is string=>!!s && !/^(video|reel|photo|image)$/i.test(s)).slice(0,12);
  let domain=url.hostname;
  const external=ownElement(root,'a[data-domain],a[data-outbound-url]',candidates);
  const outbound=metadata.getAttribute('content-href') || external?.getAttribute('href');
  if(outbound) {try {const target=new URL(outbound,url);if(/^https?:$/.test(target.protocol))domain=target.hostname;} catch { /* leave site domain */ }}
  return {root,id:metadata.getAttribute('post-id') || metadata.getAttribute('thingid') || metadata.id || permalink,site:url.hostname,url:permalink,type,author,title,body,caption:type==='reel'?body:'',hashtags:body.match(/#[\p{L}\p{N}_]+/gu) ?? [],labels,domain,evidence:[...(body ? ['visible DOM text']:[]),...(labels.length?['accessible metadata']:[])],limitations:type==='reel'?['Text and accessible metadata only; video, audio and embedded text are not analyzed.']:['Heuristic extraction; site structure may limit coverage.']};
}
function instagramPath(link: HTMLAnchorElement): string {
  try {const url=new URL(link.getAttribute('href') || '','https://www.instagram.com');return /(^|\.)instagram\.com$/.test(url.hostname)?url.pathname:'';} catch {return '';}
}
function instagramProfile(root: HTMLElement): HTMLAnchorElement | undefined {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).find(a=>{
    const path=instagramPath(a);
    return /^\/[\w.]+(?:\/reels)?\/?$/.test(path) && !/^\/(reels|reel|p|explore|direct|accounts|stories|about|legal)\/?$/.test(path);
  });
}
function instagramPermalink(root: HTMLElement): HTMLAnchorElement | undefined {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).find(a=>/^\/(?:p|reel|reels)\/(?!audio(?:\/|$))[\w-]+\/?$/.test(instagramPath(a)));
}
export const instagram: Adapter = {
  id:'instagram-reels',matches:url=>/(^|\.)instagram\.com$/.test(url.hostname),
  discover(doc) {
    const roots = new Set<HTMLElement>(query(doc,'main article').filter(root=>!root.querySelector('article')));
    for(const video of doc.querySelectorAll('video')) {
      const article=video.closest('article');
      if(article && article.querySelectorAll('video').length===1){roots.add(article);continue;}
      let el=video.parentElement,fallback:HTMLElement|undefined;
      // Desktop Reels have many player wrappers and no article. Walk to the
      // caption/action shell, stopping before a feed or another video's shell.
      for(let depth=0;el && depth<40;depth++,el=el.parentElement) {
        if(el.matches('main,body,[role="main"],[role="dialog"],nav')) break;
        if(el.querySelectorAll('video').length!==1) break;
        const hasIdentity=!!instagramProfile(el) || !!instagramPermalink(el);
        if(hasIdentity && !fallback)fallback=el;
        if(el.querySelector('[aria-label="Like"],[aria-label="Unlike"],[aria-label="Comment"]')) {fallback=el;break;}
      }
      if(fallback)roots.add(fallback);
    }
    // An article and its video shell must never become overlapping units.
    return [...roots].filter(root=>![...roots].some(other=>other!==root && other.contains(root)));
  },
  extract(root,url,candidates) {
    const item=extract(root,url,candidates,root.querySelector('video')?'reel':'post');
    const viewport=root.ownerDocument.defaultView!;
    const ranked=[...candidates].map(candidate=>{
      const rect=candidate.getBoundingClientRect();
      const visible=Math.max(0,Math.min(rect.bottom,viewport.innerHeight)-Math.max(rect.top,0))*Math.max(0,Math.min(rect.right,viewport.innerWidth)-Math.max(rect.left,0));
      const video=candidate.querySelector('video');
      return {candidate,score:visible>0?visible+(video && !video.paused?1e12:0):0};
    }).sort((a,b)=>b.score-a.score);
    item.active=!!ranked[0]?.score && ranked[0]?.candidate===root;

    const profile=instagramProfile(root),permalink=instagramPermalink(root);
    item.author=profile?instagramPath(profile).split('/').filter(Boolean)[0]:item.author;
    const caption=Array.from(root.querySelectorAll<HTMLElement>('[role="button"],button')).find(el=>!el.hasAttribute('aria-label') && !el.querySelector('svg,video,[role="button"],button') && (el.textContent?.trim().length ?? 0)>=8)?.textContent?.replace(/\s+/g,' ').trim();
    // Paired with the active canonical Reel route, this survives recreated blob
    // URLs without confusing two different reels that share a creator/caption.
    if(caption && item.author)item.identityHint=JSON.stringify([item.author,caption]);
    // Creator /username/reels/ links and audio links are not reel permalinks.
    // Media identity distinguishes preloaded/recycled reels without borrowing
    // the current page's URL for every video on screen.
    const video=root.querySelector('video'),media=video?.getAttribute('src') || video?.querySelector('source')?.getAttribute('src') || video?.getAttribute('poster');
    item.url=permalink?new URL(instagramPath(permalink),url).href:new URL('/reels/',url).href;
    item.id=permalink?item.url:`instagram:${item.author || ''}:${media || root.id || item.body}`;
    // Author and player chrome alone do not constitute useful reel text.
    if(item.author) item.body=item.body.replace(item.author,'').trim();
    item.caption=item.body;
    return item;
  }
};
const redditComment='shreddit-comment,.thing.comment,[data-testid="comment"]';
export const reddit: Adapter = {id:'reddit',matches:url=>/(^|\.)reddit\.com$/.test(url.hostname),discover:doc=>[...new Set(query(doc,SELECTORS.reddit).flatMap(root=>{
  if(root.matches(redditComment)) {
    // Treat only this comment's body. A Reddit comment shell includes its entire
    // reply tree, so blurring that shell would also conceal unrelated replies.
    const body=Array.from(root.querySelectorAll<HTMLElement>('[slot="comment"],.entry,[data-testid="comment-body"]')).find(el=>el.closest(redditComment)===root);
    return body?[body]:root.querySelector(redditComment)?[]:[root];
  }
  if(!root.matches('shreddit-post'))return [root];
  const article=root.closest('article');
  return [article && article.querySelectorAll('shreddit-post').length===1 && !article.querySelector(redditComment)?article:root];
}))],extract:(root,url,c)=>{
  const comment=root.closest<HTMLElement>(redditComment);
  const ownedCandidates=new Set([...c,...root.querySelectorAll<HTMLElement>(redditComment)]);
  const item=comment?extract(root,url,ownedCandidates,'comment',comment):extract(root,url,ownedCandidates,'post');
  const metadata=comment || root.querySelector('shreddit-post') || root;
  const community=metadata.getAttribute('subreddit-prefixed-name') || metadata.getAttribute('subreddit-name') || metadata.getAttribute('data-subreddit') || /^\/r\/([^/]+)/i.exec(new URL(item.url).pathname)?.[1];
  if(community){item.community=`r/${community.replace(/^r\//i,'')}`;item.evidence.push('Reddit community metadata');}
  return item;
}};
export const forum: Adapter = {id:'forum',matches:(_url,doc)=>!!doc.querySelector(SELECTORS.forum),discover:doc=>query(doc,SELECTORS.forum),extract:(root,url,c)=>extract(root,url,c,root.matches('[itemtype$="/Comment"],[data-comment-id],.Comment')?'comment':'post')};
export const news: Adapter = {
  id:'news',matches:(_url,doc)=>!!doc.querySelector('meta[property="og:type"][content="article"], [itemtype$="/NewsArticle"], main article h1, article section'),
  discover(doc) {
    return query(doc,SELECTORS.news).flatMap(root=>{
      // Article sections have reliable boundaries; never filter an entire long article.
      const sections=Array.from(root.querySelectorAll<HTMLElement>(':scope > section, :scope > [itemprop="articleBody"] > section'));
      if(sections.length) return sections;
      if(root.querySelector('h1') || (root.textContent?.length ?? 0)>2500) return Array.from(root.querySelectorAll<HTMLElement>('p')).filter(p=>!p.closest('aside,nav'));
      return [root];
    });
  },extract:(root,url,c)=>extract(root,url,c,root.matches('section,p')?'article-section':'news-card')
};
export const generic: Adapter = {id:'generic',matches:()=>true,discover:doc=>query(doc,SELECTORS.generic).filter(el=>!el.querySelector('article,[role="article"]') && (el.textContent?.length ?? 0)<2500),extract:(root,url,c)=>extract(root,url,c,'post')};
export const adapters=[instagram,reddit,forum,news,generic];
export const chooseAdapter = (url:URL,doc:Document) => adapters.find(a=>a.matches(url,doc))!;
