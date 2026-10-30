// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { instagram } from '../src/adapters';
import { FilterEngine } from '../src/engine';
import { evaluate } from '../src/classifier';
import { DEFAULTS, presetRule } from '../src/model';
let engine:FilterEngine|undefined;
afterEach(()=>{engine?.destroy();document.body.innerHTML='';});
describe('Instagram post stability',()=>{
  it('keeps stable /p/ identity, caption word boundaries and golf evidence',()=>{
    document.body.innerHTML='<main><article><header><a href="/golf_author/">golf_author</a><a href="/p/post123/">1h</a></header><div><span>golf_author</span><span>golfers practice on the greens</span></div><a href="/reels/audio/music/">Non-golf track title</a></article></main>';
    const roots=instagram.discover(document),item=instagram.extract(roots[0],new URL('https://www.instagram.com/'),new Set(roots));
    expect(item.url).toBe('https://www.instagram.com/p/post123/');expect(item.id).toBe(item.url);
    expect(item.body).toContain('golfers practice');expect(item.body).not.toContain('Non-golf track');
    expect(evaluate(item,{...structuredClone(DEFAULTS),demoControls:true,rules:[presetRule('golf')]})).toMatchObject({status:'match',term:'golfers'});
  });
  it('keeps the same controls through repeated unrelated rescans',()=>{
    document.body.innerHTML='<article><p>Peaceful afternoon</p></article><article><p>Casino promotion</p></article>';
    engine=new FilterEngine({...structuredClone(DEFAULTS),demoControls:true,rules:[presetRule('gambling')]},async()=>{});
    const manual=document.querySelector('quiet-web-manual'),hidden=document.querySelector('quiet-web-controls');
    for(let i=0;i<10;i++)engine.scan();
    expect(document.querySelector('quiet-web-manual')).toBe(manual);expect(document.querySelector('quiet-web-controls')).toBe(hidden);
    expect((manual as HTMLElement).style.position).toBe('absolute');
  });
  it('keeps manual state when a stable post updates its timestamp or caption',()=>{
    document.body.innerHTML='<article><a rel="bookmark" href="/p/original/">1h</a><p>A peaceful afternoon</p></article>';
    engine=new FilterEngine({...structuredClone(DEFAULTS),demoControls:true},async()=>{});
    document.querySelector('quiet-web-manual')!.shadowRoot!.querySelector('button')!.click();
    const control=document.querySelector('quiet-web-controls');
    document.querySelector('a')!.textContent='2h';document.querySelector('p')!.textContent='An expanded caption with more text';engine.scan();
    expect(document.querySelector('quiet-web-controls')).toBe(control);
    document.querySelector('a')!.href='/p/different/';engine.scan();expect(document.querySelector('quiet-web-controls')).toBeNull();
  });
  it('treats new children inside a hidden post without rebuilding its overlay',()=>{
    document.body.innerHTML='<article><a rel="bookmark" href="/p/stable/">Post</a><p>Casino promotion</p></article>';
    engine=new FilterEngine({...structuredClone(DEFAULTS),demoControls:true,rules:[presetRule('gambling')]},async()=>{});
    const control=document.querySelector('quiet-web-controls');const child=document.createElement('div');child.textContent='More media';child.inert=false;document.querySelector('article')!.append(child);engine.scan();
    expect(document.querySelector('quiet-web-controls')).toBe(control);expect(child.inert).toBe(true);expect(child.style.filter).toBe('blur(12px)');
    engine.destroy();expect(child.inert).toBe(false);expect(child.style.filter).toBe('');
  });
});
