// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.reddit.com/r/test/"}
import { afterEach, describe, expect, it } from 'vitest';
import { reddit } from '../src/adapters';
import { FilterEngine } from '../src/engine';
import { DEFAULTS, presetRule } from '../src/model';
import { evaluate } from '../src/classifier';
let engine:FilterEngine|undefined;
afterEach(()=>{engine?.destroy();document.body.innerHTML='';});
const prefs=()=>({...structuredClone(DEFAULTS),demoControls:true,rules:[presetRule('gambling')]});
const fixture=()=>{document.body.innerHTML=`<main>
  <shreddit-post id="post" permalink="/r/test/comments/post/" author="alice" post-title="A quiet day"><h2>A quiet day</h2></shreddit-post>
  <shreddit-comment thingid="parent" permalink="/r/test/comments/post/comment/parent/" author="bob"><details open>
    <summary><time>1h</time></summary><div class="comment-main-grid">
      <div id="parent-body" slot="comment"><p>Casino promotion</p></div>
      <div id="comment-children"><shreddit-comment thingid="reply" permalink="/r/test/comments/post/comment/reply/" author="carol"><details open>
        <summary><time>1h</time></summary><div><div id="reply-body" slot="comment"><p>A quiet reply</p></div></div>
      </details></shreddit-comment></div>
    </div>
  </details></shreddit-comment>
</main>`;};
describe('Reddit comment boundaries and contextual controls',()=>{
  it('remembers a manually locked comment after it unmounts and returns',()=>{
    fixture();engine=new FilterEngine(prefs(),async()=>{});
    document.querySelector('#reply-body > quiet-web-manual')!.shadowRoot!.querySelector('button')!.click();
    document.querySelector('shreddit-comment[thingid="reply"]')!.remove();engine.scan();
    fixture();engine.scan();
    expect(document.querySelector('#reply-body > quiet-web-controls')).not.toBeNull();
    document.querySelector('#reply-body > quiet-web-controls')!.shadowRoot!.querySelector('button')!.click();
    fixture();engine.scan();expect(document.querySelector('#reply-body > quiet-web-controls')).toBeNull();
  });
  it('extracts each body with its own stable comment metadata',()=>{
    fixture();const roots=reddit.discover(document),candidates=new Set(roots);
    expect(roots.map(r=>r.id)).toEqual(['post','parent-body','reply-body']);
    const parent=reddit.extract(roots[1],new URL(location.href),candidates);
    expect(parent).toMatchObject({id:'parent',type:'comment',author:'bob',body:'Casino promotion',url:'https://www.reddit.com/r/test/comments/post/comment/parent/'});
    expect(parent.body).not.toContain('quiet reply');
  });
  it('hides a matched parent body while leaving its replies readable and interactive',()=>{
    fixture();engine=new FilterEngine(prefs(),async()=>{});
    expect(document.querySelector('#parent-body > quiet-web-controls')).not.toBeNull();
    expect(document.querySelector('#reply-body > quiet-web-manual')).not.toBeNull();
    expect(document.querySelector('#comment-children')?.hasAttribute('inert')).toBe(false);
    expect((document.querySelector('#comment-children') as HTMLElement).style.filter).toBe('');
    expect(engine.status).toMatchObject({scanned:3,hidden:1});
    const shadow=document.querySelector('#parent-body > quiet-web-controls')!.shadowRoot!;
    expect([...shadow.querySelectorAll('button')].map(b=>b.textContent)).not.toContain('Add to filter');
    expect(shadow.querySelector('details')).not.toBeNull();
    expect(shadow.querySelector('.panel > p')).toBeNull();
  });
  it('offers only Undo after a demo hide and restores that comment independently',()=>{
    fixture();engine=new FilterEngine(prefs(),async()=>{});
    const button=document.querySelector('#reply-body > quiet-web-manual')!.shadowRoot!.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Hide this comment with Leak Lock');button.click();
    const control=document.querySelector('#reply-body > quiet-web-controls')!,shadow=control.shadowRoot!;
    expect([...shadow.querySelectorAll('button')].map(b=>b.textContent)).toEqual(['Undo hide']);
    expect(shadow.querySelector('details')).toBeNull();
    document.querySelector('time')!.textContent='2h';engine.scan();
    expect(document.querySelector('#reply-body > quiet-web-controls')).toBe(control);
    shadow.querySelector('button')!.click();
    expect(document.querySelector('#reply-body > quiet-web-controls')).toBeNull();
    expect(document.querySelector('#parent-body > quiet-web-controls')).not.toBeNull();
  });
  it('uses old Reddit entry boundaries without hiding child replies',()=>{
    document.body.innerHTML='<div class="thing comment" data-author="bob"><div class="entry" id="entry-parent"><div class="md">Casino promotion</div></div><div class="child"><div class="thing comment" data-author="carol"><div class="entry" id="entry-reply"><div class="md">A peaceful reply</div></div></div></div></div>';
    const roots=reddit.discover(document);expect(roots.map(r=>r.id)).toEqual(['entry-parent','entry-reply']);
    expect(reddit.extract(roots[0],new URL(location.href),new Set(roots)).author).toBe('bob');
    engine=new FilterEngine(prefs(),async()=>{});expect(engine.status.hidden).toBe(1);
    expect(document.querySelector('#entry-reply > quiet-web-manual')).not.toBeNull();
  });
  it('skips an unbounded parent comment instead of hiding a whole thread',()=>{
    document.body.innerHTML='<shreddit-comment>Casino promotion<shreddit-comment>A peaceful reply</shreddit-comment></shreddit-comment>';
    const roots=reddit.discover(document);expect(roots).toHaveLength(1);expect(roots[0].textContent).toBe('A peaceful reply');
  });
  it('uses r/dune as spoiler context while keeping non-spoiler posts visible',()=>{
    document.body.innerHTML='<shreddit-post subreddit-prefixed-name="r/dune" permalink="/r/dune/comments/one/" post-title="The ending explained"><h2>The ending explained</h2></shreddit-post><shreddit-post subreddit-name="dune" permalink="/r/dune/comments/two/" post-title="Official trailer"><h2>Official trailer</h2></shreddit-post>';
    const roots=reddit.discover(document),p={...structuredClone(DEFAULTS),rules:[presetRule('dune')]};
    const first=reddit.extract(roots[0],new URL(location.href),new Set(roots));
    expect(first.community).toBe('r/dune');expect(evaluate(first,p)).toMatchObject({status:'match',contextTerm:'dune',term:'ending'});
    expect(evaluate(reddit.extract(roots[1],new URL(location.href),new Set(roots)),p).status).toBe('clear');
  });
  it('uses the comment permalink community without borrowing a parent headline',()=>{
    document.body.innerHTML='<shreddit-comment thingid="reply" permalink="/r/dune/comments/one/comment/reply/"><div slot="comment"><p>The final scene is a surprise</p></div></shreddit-comment>';
    const roots=reddit.discover(document),item=reddit.extract(roots[0],new URL(location.href),new Set(roots));
    expect(evaluate(item,{...structuredClone(DEFAULTS),rules:[presetRule('dune')]})).toMatchObject({status:'match',contextTerm:'dune',term:'final scene'});
  });
  it('uses arbitrary community names for any filter without topic-specific mappings',()=>{
    document.body.innerHTML='<shreddit-post subreddit-name="Orchid_Growers" post-title="A new setup"></shreddit-post><shreddit-post subreddit-name="GardenTips" post-title="My tools"></shreddit-post>';
    const roots=reddit.discover(document),items=roots.map(r=>reddit.extract(r,new URL(location.href),new Set(roots)));
    const p=prefs();p.rules[0].terms=['orchid'];
    expect(evaluate(items[0],p)).toMatchObject({status:'match',field:'community',term:'orchid'});
    p.rules[0].terms=['garden'];expect(evaluate(items[1],p)).toMatchObject({status:'match',field:'community',term:'garden'});
  });
  it('does not borrow subreddit context from the sidebar or another post',()=>{
    document.body.innerHTML='<aside>r/dune</aside><shreddit-post subreddit-name="movies" permalink="/r/movies/comments/one/" post-title="The ending explained"></shreddit-post>';
    const roots=reddit.discover(document),item=reddit.extract(roots[0],new URL(location.href),new Set(roots));
    expect(item.community).toBe('r/movies');expect(evaluate(item,{...structuredClone(DEFAULTS),rules:[presetRule('dune')]}).status).toBe('clear');
  });
});
