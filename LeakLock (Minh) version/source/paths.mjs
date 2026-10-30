import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Keep this independent demo build beside its source directory.
export function extensionDirectory() {
  let config={};
  try { config=JSON.parse(readFileSync(new URL('./build.local.json',import.meta.url),'utf8')); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  if(config.outputDirectory!==undefined && typeof config.outputDirectory!=='string')throw new Error('outputDirectory must be a path');
  return resolve(config.outputDirectory || '../extension');
}
