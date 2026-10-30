// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { FilterEngine } from '../src/engine';
import { DEFAULTS, presetRule } from '../src/model';
import { applyTreatment } from '../src/treatment';
import { type ContentUnit } from '../src/model';
import { validatePreferences } from '../src/preferences';
let engine:FilterEngine|undefined;
afterEach(()=>{engine?.destroy();document.body.innerHTML='';});
describe('optional demo controls',()=>{
  it('defaults off for new and existing settings, rejecting malformed values',()=>{
    expect(DEFAULTS.demoControls).toBe(false);
    const old=structuredClone(DEFAULTS);delete old.demoControls;
    expect(validatePreferences(old).demoControls).toBe(false);
    expect(validatePreferences({...old,demoControls:true}).demoControls).toBe(true);
    expect(()=>validatePreferences({...old,demoControls:'true'})).toThrow('demo controls');
  });
  it('keeps automatic matches active without injecting demo buttons',()=>{
    document.body.innerHTML='<article><p>Casino promotion</p></article><article><p>A quiet afternoon</p></article>';
    engine=new FilterEngine({...structuredClone(DEFAULTS),rules:[presetRule('gambling')]},async()=>{});
    expect(document.querySelectorAll('quiet-web-controls')).toHaveLength(1);
    expect(document.querySelector('quiet-web-manual')).toBeNull();
  });
  it('enables demos, then removes manual hides and controls when switched off',()=>{
    document.body.innerHTML='<article id="auto"><p>Casino promotion</p></article><article id="manual" style="color:red"><p>A quiet afternoon</p></article>';
    const prefs={...structuredClone(DEFAULTS),rules:[presetRule('gambling')]};
    engine=new FilterEngine(prefs,async()=>{});
    engine.update({...prefs,demoControls:true});
    document.querySelector('#manual quiet-web-manual')!.shadowRoot!.querySelector('button')!.click();
    expect(document.querySelector('#manual quiet-web-controls')).not.toBeNull();
    engine.update({...prefs,demoControls:false});
    expect(document.querySelector('#manual quiet-web-controls')).toBeNull();
    expect(document.querySelector('quiet-web-manual')).toBeNull();
    expect(document.querySelector('#manual')!.getAttribute('style')).toBe('color:red');
    expect(document.querySelector('#auto quiet-web-controls')).not.toBeNull();
  });
  it('uses a compact Locked card only for demo hides and restores the original layout',()=>{
    document.body.innerHTML='<article id="auto"><p>Casino promotion</p></article><article id="demo" style="height:640px;min-height:500px;display:flex;padding:20px"><p>A quiet afternoon</p></article>';
    engine=new FilterEngine({...structuredClone(DEFAULTS),demoControls:true,rules:[presetRule('gambling')]},async()=>{});
    const root=document.querySelector<HTMLElement>('#demo')!,original=root.getAttribute('style');
    const item:ContentUnit={root,id:'demo',site:'www.reddit.com',url:'https://www.reddit.com/r/demo/',type:'post',title:'',body:'',caption:'',hashtags:[],labels:[],evidence:[],limitations:[]};
    const treatment=applyTreatment(item,{status:'clear'},()=>treatment.restore(),()=>{},{manual:true,rules:[],learn:async()=>{}});
    const shadow=treatment.host.shadowRoot!;
    expect(shadow.querySelector('strong')!.textContent).toBe('Locked');
    expect(root.style.height).toBe('auto');expect(root.querySelector('p')!.style.display).toBe('none');
    expect(shadow.querySelector('.lock-mark')).not.toBeNull();
    expect(document.querySelector('#auto p')!.getAttribute('style')).toContain('blur(12px)');
    expect(document.querySelector('#auto quiet-web-controls')!.shadowRoot!.querySelector('strong')!.textContent).toBe('Locked');
    shadow.querySelector('button')!.click();expect(root.getAttribute('style')).toBe(original);
  });
  it.each([true,false])('preserves a Reels viewport for manual=%s even when the rule uses collapse',manual=>{
    document.body.innerHTML='<div id="reel" style="height:720px;width:405px;display:flex"><div><video></video><p>Caption</p></div></div>';
    const root=document.querySelector<HTMLElement>('#reel')!;
    const item:ContentUnit={root,id:'reel',site:'www.instagram.com',url:'https://www.instagram.com/reels/demo/',type:'reel',title:'',body:'',caption:'',hashtags:[],labels:[],evidence:[],limitations:[]};
    const treatment=applyTreatment(item,{status:'match',rule:presetRule('golf','collapse')},()=>{},()=>{},{manual,rules:[],learn:async()=>{}});
    expect(root.style.height).toBe('720px');expect(root.style.width).toBe('405px');expect(root.style.display).toBe('flex');
    expect(root.querySelector('div')!.style.display).not.toBe('none');
    expect(treatment.host.style.position).toBe('absolute');
    expect(treatment.host.shadowRoot!.querySelector('strong')!.textContent).toBe('Locked');
    expect(treatment.host.shadowRoot!.querySelector('.lock-mark')).not.toBeNull();
    expect(treatment.host.shadowRoot!.textContent).not.toContain('Golf content');
    expect(treatment.host.shadowRoot!.querySelector('button')!.textContent).toBe(manual?'Undo hide':'Reveal for 30s');
    treatment.restore();
  });
});
