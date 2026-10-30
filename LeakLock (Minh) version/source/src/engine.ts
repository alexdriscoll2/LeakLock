import { chooseAdapter } from './adapters';
import { evaluate } from './classifier';
import { authorKey, type ContentUnit, type Preferences, type Status } from './model';
import { addManualControl, type Learn, type ManualControl } from './manual';
import { applyTreatment, type Treatment } from './treatment';
type RecordState={identity:string;signature?:string;item:ContentUnit;treatment?:Treatment;manual?:ManualControl;manualHidden?:boolean;revealedUntil?:number};
type Interaction={manualHidden:boolean;revealedUntil?:number};
export class FilterEngine {
  private records=new Map<HTMLElement,RecordState>();
  // Feed virtualization replaces DOM nodes. Keep user choices by content identity,
  // independently of the controls and roots that currently happen to be mounted.
  private interactions=new Map<string,Interaction>();
  private timer?:ReturnType<typeof setTimeout>;
  private observer:MutationObserver;
  private navigation:ReturnType<typeof setInterval>;
  private revealTimers=new Set<ReturnType<typeof setTimeout>>();
  private lastURL='';
  private revision=0;
  private onViewport=()=>{if(this.status.adapter==='instagram-reels')this.schedule();};
  status:Status={adapter:'generic',scanned:0,hidden:0,insufficient:0,paused:false};
  constructor(private prefs:Preferences,private mutate:(kind:'author'|'domain',value:string)=>Promise<void>,private doc:Document=document,private learn:Learn=async()=>{throw new Error('Learning unavailable');}) {
    this.observer=new MutationObserver(mutations=>{
      if(mutations.some(m=>!(m.target instanceof Element && m.target.closest('quiet-web-controls,quiet-web-manual'))))this.schedule();
    });
    this.observe();
    doc.defaultView?.addEventListener('scroll',this.onViewport,{passive:true,capture:true});
    doc.defaultView?.addEventListener('resize',this.onViewport,{passive:true});
    this.navigation=setInterval(()=>{if(this.lastURL!==this.doc.location.href)this.schedule();},700);
    this.scan();
  }
  private observe(){this.observer.observe(this.doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','src','aria-label','alt','post-id','thingid','permalink','author','data-author','data-permalink','data-post-id','data-comment-id','subreddit-name','subreddit-prefixed-name','data-subreddit']});}
  private schedule(){if(!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;this.scan();},180);}
  private clearView(state:RecordState,focus=false){state.manual?.restore();state.manual=undefined;state.treatment?.restore(focus);state.treatment=undefined;}
  update(prefs:Preferences){this.prefs=prefs;this.revision++;for(const [identity,state] of this.interactions){state.revealedUntil=undefined;if(!prefs.demoControls || !state.manualHidden)this.interactions.delete(identity);}this.scan();}
  private routeKey(item:ContentUnit){
    const url=new URL(this.doc.location.href);
    return item.type==='reel' && item.active && item.identityHint && /(^|\.)instagram\.com$/.test(url.hostname) && /^\/reels?\/[\w-]+\/?$/.test(url.pathname)?`reel-route:${url.origin}${url.pathname.replace(/\/$/,'')}|${item.identityHint}`:undefined;
  }
  private remember(state:RecordState){
    const route=this.routeKey(state.item),previous=this.interactions.get(state.identity) || (route?this.interactions.get(route):undefined);
    // Undo must clear every alias, including an older blob URL for this reel.
    if(previous)for(const [key,value] of this.interactions)if(value===previous)this.interactions.delete(key);
    if(state.manualHidden || (state.revealedUntil ?? 0)>Date.now()){
      const interaction={manualHidden:!!state.manualHidden,revealedUntil:state.revealedUntil};
      this.interactions.set(state.identity,interaction);if(route)this.interactions.set(route,interaction);
    }
  }
  scan() {
    this.observer.disconnect();
    try {
      for(const [key,value] of this.interactions)if(!value.manualHidden && (value.revealedUntil ?? 0)<=Date.now())this.interactions.delete(key);
      const url=new URL(this.doc.location.href),navigated=this.lastURL!==url.href;
      this.lastURL=url.href;
      if(navigated){for(const state of this.records.values())this.clearView(state);this.records.clear();}
      const adapter=chooseAdapter(url,this.doc);
      const roots=adapter.discover(this.doc).filter(el=>el.isConnected && !el.closest('nav,header,footer,aside,quiet-web-controls,quiet-web-manual'));
      const candidates=new Set(roots);
      for(const [root,state] of this.records)if(!candidates.has(root)){this.clearView(state);this.records.delete(root);}
      this.status={adapter:adapter.id,scanned:0,hidden:0,insufficient:0,paused:!this.prefs.enabled || this.prefs.pausedSites.includes(url.hostname)};
      if(this.status.paused){for(const state of this.records.values())this.clearView(state);this.records.clear();return;}
      for(const root of roots) {
        const item=adapter.extract(root,url,candidates);
        const {root:_,active:__,...serializable}=item;
        const fingerprint=JSON.stringify(serializable);
        const identity=item.url!==url.href || root.matches('[post-id],[thingid],[data-post-id],[data-comment-id],shreddit-post,shreddit-comment') || root.querySelector('shreddit-post') || /\/(?:p|reel|reels|comments)\/[^/]+/.test(item.url)?`${item.id}|${item.url}`:JSON.stringify([fingerprint,root.querySelector('video')?.getAttribute('src')]);
        let state=this.records.get(root);
        if(!state || state.identity!==identity){if(state)this.clearView(state);state={identity,item};this.records.set(root,state);}
        state.item=item;
        const route=this.routeKey(item),remembered=this.interactions.get(identity) || (route?this.interactions.get(route):undefined);
        if(remembered){this.interactions.set(identity,remembered);if(route)this.interactions.set(route,remembered);}
        state.manualHidden=remembered?.manualHidden ?? false;
        state.revealedUntil=remembered?.revealedUntil;
        this.status.scanned++;
        const decision=evaluate(item,this.prefs);
        if(decision.status==='insufficient')this.status.insufficient++;
        const covered=[...this.records].some(([other,s])=>other!==root && other.contains(root) && !!s.treatment);
        if(covered){this.clearView(state);state.signature=undefined;continue;}
        const hidden=!!state.manualHidden || (decision.status==='match' && (state.revealedUntil ?? 0)<=Date.now());
        const signature=JSON.stringify([hidden,!!state.manualHidden,decision.rule,decision.term,decision.field,decision.contextTerm,this.revision,item.author,item.domain]);
        // Keep controls and focus in place. Restoring/reinserting the whole feed on
        // every mutation forced layout and repeatedly moved Instagram's scroll anchor.
        if(state.signature===signature && (hidden?state.treatment?.host.isConnected:state.manual?.host.isConnected)) {
          state.treatment?.refresh();
          if(hidden)this.status.hidden++;
          continue;
        }
        const previous=state.treatment?.host.shadowRoot;
        const form=previous?.querySelector('form');
        const expanded=previous?.querySelector('details')?.open;
        const focused=previous?.activeElement?.getAttribute('aria-label') || previous?.activeElement?.textContent;
        this.clearView(state);
        state.signature=signature;
        const current=state;
        if(!hidden){
          if(this.prefs.demoControls)state.manual=addManualControl(item,()=>{current.manualHidden=true;current.revealedUntil=undefined;this.remember(current);this.scan();current.treatment?.host.shadowRoot?.querySelector('button')?.focus({preventScroll:true});});
          continue;
        }
        state.treatment=applyTreatment(item,decision,()=>{
          current.manualHidden=false;current.revealedUntil=Date.now()+30_000;
          this.remember(current);
          this.clearView(current,true);current.signature=undefined;this.scan();
          const timer=setTimeout(()=>{this.revealTimers.delete(timer);this.schedule();},30_010);this.revealTimers.add(timer);
        },kind=>{const latest=current.item;void this.mutate(kind,kind==='author'?authorKey(latest.site,latest.author!):latest.domain || latest.site).catch(error=>{
          const panel=current.treatment?.host.shadowRoot?.querySelector('.panel');
          if(panel){let p=panel.querySelector<HTMLParagraphElement>('.allow-error');if(!p){p=this.doc.createElement('p');p.className='allow-error';p.setAttribute('role','status');panel.append(p);}p.textContent=`Could not save: ${String(error)}`;}
        });},{rules:this.prefs.rules,learn:this.learn,manual:!!state.manualHidden});
        const shadow=state.treatment.host.shadowRoot!;
        const more=shadow.querySelector('details');if(more && expanded)more.open=true;
        if(form)shadow.querySelector('.panel')?.append(form);
        if(focused)[...shadow.querySelectorAll<HTMLElement>('button,summary,input,select')].find(el=>(el.getAttribute('aria-label') || el.textContent)===focused)?.focus({preventScroll:true});
        this.status.hidden++;
      }
    } finally {this.observe();}
  }
  destroy(){this.doc.defaultView?.removeEventListener('scroll',this.onViewport,true);this.doc.defaultView?.removeEventListener('resize',this.onViewport);clearInterval(this.navigation);clearTimeout(this.timer);for(const timer of this.revealTimers)clearTimeout(timer);this.observer.disconnect();for(const state of this.records.values())this.clearView(state,true);this.records.clear();this.interactions.clear();}
}
