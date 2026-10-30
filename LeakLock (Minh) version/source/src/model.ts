export type Action = 'blur' | 'collapse';
export type ContentType = 'reel' | 'post' | 'comment' | 'thread' | 'news-card' | 'article-section';
export interface ContentData {
  id: string; site: string; url: string; type: ContentType; author?: string;
  title: string; body: string; caption: string; hashtags: string[]; labels: string[];
  evidence: string[]; limitations: string[]; domain?: string; community?: string; active?: boolean; identityHint?: string;
}
// DOM roots never cross extension messaging boundaries.
export interface ContentUnit extends ContentData { root: HTMLElement }
export interface Adapter {
  id: string;
  matches(url: URL, doc: Document): boolean;
  discover(doc: Document): HTMLElement[];
  extract(root: HTMLElement, url: URL, candidates: Set<HTMLElement>): ContentUnit;
}
export interface Rule { id: string; name: string; enabled: boolean; action: Action; terms: string[]; except: string[]; contextTerms?: string[]; }
export interface Preferences {
  demoControls?: boolean;
  presetsVersion?: number; enabled: boolean; defaultAction: Action; rules: Rule[]; pausedSites: string[];
  allowedAuthors: string[]; allowedDomains: string[];
}
export interface Decision { status: 'match' | 'clear' | 'insufficient' | 'allowed'; rule?: Rule; field?: string; term?: string; contextTerm?: string; }
export interface Status { adapter: string; scanned: number; hidden: number; insufficient: number; paused: boolean; }
export type Mutation = {type:'toggleSite';site:string} | {type:'allowAuthor';author:string} | {type:'allowDomain';domain:string} | {type:'learnRule';ruleId:string;phrase:string} | {type:'save';preferences:Preferences};
export const PRESETS = {
  gambling: {name:'Gambling promotions',terms:['casino','sportsbook','free bet','betting bonus','bet now','gambling','promo odds'],except:[]},
  gossip: {name:'Celebrity gossip',terms:['celebrity gossip','dating rumors','dating rumours','celebrity breakup','secret romance','paparazzi'],except:['film review','movie review','cinema review']},
  politics: {name:'Political arguments',terms:['libtard','snowflake liberals','idiot conservatives','political rant','stolen election','traitor voters'],except:['election results','election reporting','official vote count','polling station']},
  dune: {name:'Dune movie spoilers',contextTerms:['dune','dune2','dune3','duneparttwo','dunepartthree','dunemessiah'],terms:['spoiler','spoilers','ending','ending explained','plot leak','plot leaks','final scene','post credits','post-credits','dies','death','killed','kills','twist'],except:['spoiler-free','spoiler free','no spoilers']},
  golf: {name:'Golf content',terms:['golf','golfer','golfers','golfing','golf swing','golf course','golf club','golf clubs','golf lesson','golfswing','golftips','golflife','golfcontent','golfreels','PGA','PGA Tour','LPGA','LIV Golf','tee time','driving range','putting green','fairway'],except:[]},
  spoilers: {name:'Sports spoilers',terms:['final score','match result','game result','wins the match','won the game','spoiler'],except:[]}
} satisfies Record<string,{name:string;terms:string[];except:string[];contextTerms?:string[]}>;
export function presetRule(key: keyof typeof PRESETS, action: Action = 'blur'): Rule { return {id:crypto.randomUUID(), ...PRESETS[key], terms:[...PRESETS[key].terms],except:[...PRESETS[key].except],action,enabled:true}; }
export const authorKey = (site: string, author: string) => `${site.toLowerCase()}|${author.trim().toLowerCase()}`;

export function defaultRules(): Rule[] { return (Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map(key=>({...presetRule(key),id:`preset-${key}`,enabled:false})); }
export const DEFAULTS: Preferences = {presetsVersion:3,enabled:true,demoControls:false,defaultAction:'blur',rules:defaultRules(),pausedSites:[],allowedAuthors:[],allowedDomains:[]};
