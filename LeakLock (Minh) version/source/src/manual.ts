import { disclosureMotion } from './motion';
import type { ContentUnit, Rule } from './model';
import { suggestPhrase } from './learning';
export type Learn = (ruleId:string,phrase:string)=>Promise<void>;
export const controlCSS=disclosureMotion+`
:host{font:700 13px/1.4 system-ui,sans-serif!important;color:#334155!important}*{box-sizing:border-box}
button,input,select{font:inherit;border:2px solid #dfe5e8;border-radius:12px;min-height:38px;padding:8px 12px;background:white;color:#334155;max-width:100%}
button{cursor:pointer;border-bottom-width:4px}button:active{transform:translateY(2px);border-bottom-width:2px}button:disabled{cursor:wait;opacity:.6}
button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #1cb0f6;outline-offset:2px}
form{display:grid;gap:8px;margin-top:10px;max-width:340px}label{display:grid;gap:4px;font-size:12px}p{font-size:12px;margin:6px 0;color:#526574}.primary{background:#58cc02;color:#173d00;border-color:#48ad00}.form-actions{display:flex;gap:8px;flex-wrap:wrap}
`;
export function learningForm(item:ContentUnit,rules:Rule[],learn:Learn,done:()=>void):HTMLFormElement {
  const doc=item.root.ownerDocument,form=doc.createElement('form');
  const note=doc.createElement('p');note.textContent='Choose a phrase to hide next time.';
  const select=doc.createElement('select');select.setAttribute('aria-label','Filter');
  for(const rule of rules){const option=doc.createElement('option');option.value=rule.id;option.textContent=rule.name;option.title=rule.enabled?'Filter on':'Filter off — adding content will enable it';select.append(option);}
  const phrase=doc.createElement('input');phrase.value=suggestPhrase(item);phrase.maxLength=200;phrase.required=true;phrase.setAttribute('aria-label','Matching phrase');phrase.placeholder='Matching phrase';
  const selectLabel=doc.createElement('label');selectLabel.textContent='Add to filter';selectLabel.append(select);
  const phraseLabel=doc.createElement('label');phraseLabel.textContent='Matching phrase';phraseLabel.append(phrase);
  const buttons=doc.createElement('div');buttons.className='form-actions';
  const save=doc.createElement('button');save.className='primary';save.type='submit';save.textContent='Add & enable';
  const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=done;buttons.append(save,cancel);
  const status=doc.createElement('p');status.setAttribute('role','status');
  if(!rules.length){status.textContent='Create a filter in Leak Lock first.';save.disabled=true;}
  form.append(note,selectLabel,phraseLabel,buttons,status);
  form.onsubmit=event=>{event.preventDefault();if(!phrase.value.trim()){phrase.focus();return;}save.disabled=true;status.textContent='Saving…';void learn(select.value,phrase.value).then(()=>{status.textContent=rules.find(r=>r.id===select.value)?.except.length?'Added. Filter is on; exceptions still apply.':'Added. Filter is on.';save.textContent='Added';cancel.textContent='Done';}).catch(error=>{status.textContent=String(error instanceof Error?error.message:error);save.disabled=false;});};
  form.addEventListener('click',event=>event.stopPropagation());
  form.addEventListener('keydown',event=>event.stopPropagation());
  return form;
}
export interface ManualControl {host:HTMLElement;restore():void}
export function addManualControl(item:ContentUnit,hide:()=>void):ManualControl {
  const root=item.root,doc=root.ownerDocument;
  const priorPosition=root.style.getPropertyValue('position'),priority=root.style.getPropertyPriority('position'),hadStyle=root.hasAttribute('style');
  const changed=getComputedStyle(root).position==='static';
  if(changed)root.style.setProperty('position','relative','important');
  const host=doc.createElement('quiet-web-manual');
  // Out of document flow: adding/removing Hide must never change a post's height.
  host.style.cssText=`all:initial!important;display:block!important;position:absolute!important;top:${item.type==='comment'?4:56}px!important;right:10px!important;z-index:2147483645!important;pointer-events:auto!important;`;
  const shadow=host.attachShadow({mode:'open'}),style=doc.createElement('style');style.textContent=controlCSS+`
    button{display:grid;place-items:center;width:28px;height:28px;min-height:28px;padding:5px;border:1px solid #cbd5e1;border-radius:50%;background:#ffffffed;color:#64748b;opacity:0;transition:opacity 120ms ease;touch-action:manipulation}
    :host([data-hover]) button{opacity:.65}:host button:hover,:host button:focus-visible{opacity:1;background:#fff;color:#334155}button:active{transform:none;border-bottom-width:1px}svg{width:16px;height:16px;pointer-events:none}
    @media(hover:none){button{opacity:.65}}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
  `;
  const kind=item.type==='comment'?'comment':item.type==='reel'?'reel':'post';
  const button=doc.createElement('button');button.type='button';button.title=`Demo: hide this ${kind}`;button.setAttribute('aria-label',`Hide this ${kind} with Leak Lock`);
  button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A11 11 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.3 6.3A21 21 0 0 0 2 12s4 7 10 7a11 11 0 0 0 5.7-1.7"/></svg>';
  button.onclick=event=>{event.preventDefault();event.stopPropagation();hide();};
  const enter=()=>host.setAttribute('data-hover',''),leave=()=>host.removeAttribute('data-hover');
  root.addEventListener('pointerenter',enter);root.addEventListener('pointerleave',leave);
  if(root.matches(':hover'))enter();
  shadow.append(style,button);root.append(host);
  return {host,restore(){root.removeEventListener('pointerenter',enter);root.removeEventListener('pointerleave',leave);host.remove();if(changed && root.style.position==='relative'){if(priorPosition)root.style.setProperty('position',priorPosition,priority);else root.style.removeProperty('position');if(!hadStyle && !root.style.cssText)root.removeAttribute('style');}}};
}
