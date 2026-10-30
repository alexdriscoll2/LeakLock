// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.instagram.com/reels/current/"}
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instagram } from '../src/adapters';
import { FilterEngine } from '../src/engine';
import { DEFAULTS, presetRule } from '../src/model';
const fixture=readFileSync('tests/fixtures/instagram-reels.html','utf8');
let engine:FilterEngine|undefined;
beforeEach(()=>{history.replaceState({},'','/reels/current/');document.body.innerHTML=fixture;});
afterEach(()=>{engine?.destroy();engine=undefined;document.body.innerHTML='';});
const extract=()=>{const roots=instagram.discover(document);return roots.map(root=>instagram.extract(root,new URL(location.href),new Set(roots)));};
describe('Live-shaped desktop Reels',()=>{
  it('finds deep single-video shells including captions and actions without selecting the feed',()=>{
    const roots=instagram.discover(document);
    expect(roots.map(r=>r.id)).toEqual(['golf-reel','safe-reel','unknown-reel']);
    expect(roots.every(root=>root.querySelectorAll('video').length===1 && !!root.querySelector('[aria-label="Like"]'))).toBe(true);
  });
  it('extracts creator reels links and hashtags without treating profiles/audio as permalinks',()=>{
    const [golf,safe]=extract();
    expect(golf.author).toBe('chalet_golf');expect(golf.caption).toContain('Tee time');expect(golf.hashtags).toContain('#golf');
    expect(golf.url).toBe('https://www.instagram.com/reels/');expect(golf.id).not.toBe(safe.id);
    expect(safe.body).not.toContain('Golf track');
    const permalink=document.createElement('a');permalink.href='/reel/real_shortcode/';document.querySelector('#golf-reel')!.append(permalink);
    expect(extract()[0].url).toBe('https://www.instagram.com/reel/real_shortcode/');
  });
  it('automatically filters matching reels, supports manual hide/undo, and leaves navigation usable',()=>{
    engine=new FilterEngine({...structuredClone(DEFAULTS),demoControls:true,rules:[presetRule('golf')]},async()=>{});
    expect(document.querySelector('#golf-reel > quiet-web-controls')).not.toBeNull();
    expect(document.querySelector('#safe-reel > quiet-web-controls')).toBeNull();
    const manual=document.querySelector('#safe-reel > quiet-web-manual')!;
    expect(manual.shadowRoot!.querySelector('button')!.getAttribute('aria-label')).toBe('Hide this reel with Leak Lock');
    manual.shadowRoot!.querySelector('button')!.click();
    const hidden=document.querySelector('#safe-reel > quiet-web-controls')!;
    expect(hidden.shadowRoot!.querySelectorAll('button')).toHaveLength(1);
    expect(hidden.shadowRoot!.textContent).not.toContain('Add to filter');
    hidden.shadowRoot!.querySelector('button')!.click();
    expect(document.querySelector('#safe-reel > quiet-web-controls')).toBeNull();
    expect(document.querySelector('.navigation')!.hasAttribute('inert')).toBe(false);
  });
  it('preserves manual hiding through caption updates but resets it for recycled video media',()=>{
    engine=new FilterEngine({...structuredClone(DEFAULTS),demoControls:true},async()=>{});
    document.querySelector('#safe-reel > quiet-web-manual')!.shadowRoot!.querySelector('button')!.click();
    const control=document.querySelector('#safe-reel > quiet-web-controls');
    document.querySelector('#safe-reel .caption [role="button"]')!.append(' expanded');engine.scan();
    expect(document.querySelector('#safe-reel > quiet-web-controls')).toBe(control);
    document.querySelector('#safe-reel video')!.setAttribute('src','blob:https://www.instagram.com/recycled');engine.scan();
    expect(document.querySelector('#safe-reel > quiet-web-controls')).toBeNull();
  });
  it('never falls back to the whole feed for an unidentified player',()=>{
    document.body.innerHTML='<main><div><video></video></div><div><a href="/other/reels/">Other creator</a></div></main>';
    expect(instagram.discover(document)).toHaveLength(0);
  });
  it('keeps a lock across Reels URL changes and virtualized remounts, until Undo',()=>{
    engine=new FilterEngine({...structuredClone(DEFAULTS),demoControls:true},async()=>{});
    document.querySelector('#safe-reel > quiet-web-manual')!.shadowRoot!.querySelector('button')!.click();
    history.pushState({},'','/reels/next/');document.body.innerHTML=fixture;engine.scan();
    expect(document.querySelector('#safe-reel > quiet-web-controls')!.shadowRoot!.querySelector('strong')!.textContent).toBe('Locked');
    expect(document.querySelector('#unknown-reel > quiet-web-controls')).toBeNull();
    history.pushState({},'','/reels/current/');document.body.innerHTML=fixture;engine.scan();
    document.querySelector('#safe-reel > quiet-web-controls')!.shadowRoot!.querySelector('button')!.click();
    document.body.innerHTML=fixture;engine.scan();
    expect(document.querySelector('#safe-reel > quiet-web-controls')).toBeNull();
    expect(document.querySelector('#safe-reel > quiet-web-manual')).not.toBeNull();
  });
  it('restores the same Reel with a new blob URL without locking another Reel with the same caption',()=>{
    const mount=(media:string)=>{
      document.body.innerHTML=fixture;
      const root=document.querySelector<HTMLElement>('#safe-reel')!;
      root.querySelector('video')!.setAttribute('src',`blob:https://www.instagram.com/${media}`);
      root.getBoundingClientRect=()=>({x:0,y:0,top:0,left:0,right:400,bottom:700,width:400,height:700,toJSON:()=>({})});
    };
    mount('original');engine=new FilterEngine({...structuredClone(DEFAULTS),demoControls:true},async()=>{});
    document.querySelector('#safe-reel > quiet-web-manual')!.shadowRoot!.querySelector('button')!.click();
    mount('remounted');engine.scan();expect(document.querySelector('#safe-reel > quiet-web-controls')).not.toBeNull();
    history.pushState({},'','/reels/different/');mount('other');engine.scan();
    expect(document.querySelector('#safe-reel > quiet-web-controls')).toBeNull();
    history.pushState({},'','/reels/current/');mount('returned');engine.scan();
    document.querySelector('#safe-reel > quiet-web-controls')!.shadowRoot!.querySelector('button')!.click();
    mount('returned-again');engine.scan();expect(document.querySelector('#safe-reel > quiet-web-controls')).toBeNull();
  });
});
