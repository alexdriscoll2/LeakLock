import { describe, expect, it } from 'vitest';
import { formatContent, parseContent } from '../src/filter-content';
import { PRESETS } from '../src/model';
describe('single filter content field',()=>{
  it('round-trips existing filter constraints without exposing extra form fields',()=>{for(const rule of Object.values(PRESETS)){const parsed=parseContent(formatContent(rule));expect(parsed.terms).toEqual(rule.terms);expect(parsed.except).toEqual(rule.except);if('contextTerms' in rule)expect(parsed.contextTerms).toEqual(rule.contextTerms);}});
  it('supports lines or commas, preserves explicit exceptions and context, rejects an empty hide rule',()=>{expect(parseContent('golf\nPGA, tee time\nKeep: film review\nOnly with: sports')).toEqual({terms:['golf','PGA','tee time'],except:['film review'],contextTerms:['sports']});expect(()=>parseContent('Keep: golf')).toThrow();expect(parseContent('new content')).toEqual({terms:['new content'],except:[]});});
});
