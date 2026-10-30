import { controlCSS, type Learn } from './manual';
import type { ContentUnit, Decision, Rule } from './model';
export interface Treatment { restore(moveFocus?:boolean): void; host: HTMLElement; refresh():void; }
export function applyTreatment(item:ContentUnit, decision:Decision, reveal:()=>void, allow:(kind:'author'|'domain')=>void, learning?:{rules:Rule[];learn:Learn;manual:boolean}):Treatment {
  const root=item.root;
  const host=document.createElement('quiet-web-controls');
  const shadow=host.attachShadow({mode:'open'});
  host.addEventListener('click',event=>event.stopPropagation());
  host.addEventListener('keydown',event=>event.stopPropagation());
  const demo=!!learning?.manual;
  const compact=/(^|\.)reddit\.com$/.test(item.site) || (item.type!=='reel' && !demo && decision.rule?.action==='collapse');
  const collapse=compact;
  const saved: Array<()=>void>=[];
  const originalStyles=new Map<HTMLElement,string|null>();
  function prop(el:HTMLElement,key:string,value:string) {
    if(!originalStyles.has(el))originalStyles.set(el,el.getAttribute('style'));
    const prior=el.style.getPropertyValue(key),priority=el.style.getPropertyPriority(key);
    el.style.setProperty(key,value,'important');
    saved.push(()=>{if(el.style.getPropertyValue(key)===value) {if(prior) el.style.setProperty(key,prior,priority);else el.style.removeProperty(key);}});
  }
  const wrapped: HTMLElement[]=[],treated=new WeakSet<HTMLElement>();
  function refresh(){
    for(const node of [...root.childNodes])if(node.nodeType===Node.TEXT_NODE && node.textContent?.trim()){
      const span=document.createElement('span');span.dataset.quietText='';node.replaceWith(span);span.append(node);wrapped.push(span);
    }
    for(const child of [...root.children])if(child instanceof HTMLElement && child!==host && !child.matches('quiet-web-manual') && !treated.has(child)){
      treated.add(child);const inert=child.inert;child.inert=true;saved.push(()=>{child.inert=inert;});
      if(collapse)prop(child,'display','none');else {prop(child,'filter','blur(12px)');prop(child,'user-select','none');prop(child,'pointer-events','none');}
    }
  }
  refresh();
  if(getComputedStyle(root).display==='inline')prop(root,'display','block');
  if(getComputedStyle(root).position==='static') prop(root,'position','relative');
  if(collapse) {prop(root,'padding','0px');prop(root,'min-height','0px');prop(root,'height','auto');prop(root,'max-height','none');}
  else prop(root,'min-height','160px');
  if(compact){prop(root,'display','block');prop(root,'flex-grow','0');prop(root,'flex-basis','auto');}
  for(const key of ['tabindex']) {
    const value=root.getAttribute(key);
    if(value!==null) {root.removeAttribute(key);saved.push(()=>{if(!root.hasAttribute(key))root.setAttribute(key,value);});}
  }
  host.style.cssText=`all:initial!important;display:block!important;${collapse?'position:relative!important;':'position:absolute!important;inset:0!important;'}z-index:2147483646!important;pointer-events:auto!important;`;
  const style=document.createElement('style');style.textContent=`
    :host{font:14px/1.45 system-ui,sans-serif!important;color:#183c37!important}
    *{box-sizing:border-box}.surface{${collapse?'':'position:absolute;inset:0;'}display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(247,253,239,.96);border:2px solid #d8e9c9;border-radius:18px;overflow:auto;max-height:100%}
    .surface:has(form){align-items:flex-start}.panel{max-width:460px;padding:6px;text-align:left}strong{display:block;font-size:15px;margin-bottom:4px}p{margin:4px 0 10px;font-size:12px;color:#3c5d54;overflow-wrap:anywhere}.actions{display:flex;gap:6px;flex-wrap:wrap}
    details{font:12px/1.4 system-ui;align-self:center}summary{cursor:pointer;padding:8px;color:#345b4c}details[open]{width:100%}details[open]>.actions{padding-top:5px}summary:focus-visible{outline:3px solid #b76716;outline-offset:2px}
    button{font:600 12px/1.3 system-ui;min-height:34px;border:1px solid #789b8d;border-radius:7px;padding:7px 10px;color:#163f35;background:white;cursor:pointer}button:first-child{background:#58cc02;color:#173d00;border-color:#48ad00}button:focus-visible{outline:3px solid #b76716;outline-offset:2px}`;
  style.textContent+=`
    .surface{position:${compact?'relative':'absolute'};isolation:isolate;min-height:${compact?'88px':'0'};padding:14px 18px;overflow:hidden;background:#f1f8e9;border-radius:16px}
    .surface::before{content:"";position:absolute;inset:-20px;z-index:-1;background:radial-gradient(ellipse at 18% 45%,#c9dfb1 0,transparent 48%),radial-gradient(ellipse at 85% 80%,#dfebd5 0,transparent 50%);filter:blur(16px);opacity:.8;pointer-events:none}
    .panel{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:0;max-width:100%;width:100%}
    .lock-mark{width:28px;height:28px;flex:none;color:#527247}.panel>strong{margin:0;font-size:15px}.actions{gap:6px}
    .panel>form{flex-basis:100%;margin:6px auto 0}.surface:has(form){align-items:center}
    @media(max-width:360px){.surface{padding:12px}.panel{gap:8px}.lock-mark{width:22px;height:22px}}
  `;
  const surface=document.createElement('div');surface.className='surface';surface.setAttribute('role','group');surface.setAttribute('aria-label','Leak Lock locked content');
  const panel=document.createElement('div');panel.className='panel';
  {const mark=document.createElement('span');mark.className='lock-mark';mark.setAttribute('aria-hidden','true');mark.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';panel.append(mark);}
  const title=document.createElement('strong');title.textContent='Locked';
  const actions=document.createElement('div');actions.className='actions';
  function button(label:string,callback:()=>void,target:HTMLElement=actions) {const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=event=>{event.preventDefault();event.stopPropagation();callback();};target.append(b);}
  button(learning?.manual?'Undo hide':'Reveal for 30s',reveal);
  const more=document.createElement('details');
  const summary=document.createElement('summary');summary.textContent='Always allow…';more.append(summary);
  const allowances=document.createElement('div');allowances.className='actions';more.append(allowances);
  if(item.author)button(`Allow @${item.author.replace(/^u\//,'')}`,()=>allow('author'),allowances);
  button(`Allow ${item.domain || item.site}`,()=>allow('domain'),allowances);
  if(!learning?.manual)actions.append(more);
  panel.append(title,actions);surface.append(panel);style.textContent+=controlCSS;shadow.append(style,surface);root.append(host);
  return {host,refresh,restore(moveFocus=true) {
    const focused=shadow.activeElement!==null;
    host.remove();saved.reverse().forEach(fn=>fn());
    for(const [el,original] of originalStyles){
      const normalized=document.createElement('div');if(original!==null)normalized.setAttribute('style',original);
      if(el.style.cssText===normalized.style.cssText){if(original===null)el.removeAttribute('style');else el.setAttribute('style',original);}
    }
    for(const span of wrapped) if(span.isConnected)span.replaceWith(...span.childNodes);
    if(moveFocus && focused && root.isConnected) {const prev=root.getAttribute('tabindex');root.tabIndex=-1;root.focus({preventScroll:true});if(prev===null) root.removeAttribute('tabindex');else root.setAttribute('tabindex',prev);}
  }};
}
