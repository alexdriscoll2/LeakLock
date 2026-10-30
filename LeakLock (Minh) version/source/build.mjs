import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extensionDirectory } from './paths.mjs';
// One canonical unpacked install. Rebuild in place to preserve Chrome's extension identity.
const output=extensionDirectory();
await mkdir(output,{recursive:true});
await build({entryPoints:['src/content.ts','src/background.ts','src/ui.ts'],outdir:output,bundle:true,format:'iife',target:'chrome120',minify:false});
for(const file of ['manifest.json','popup.html','options.html','ui.css','README.md'])await cp(file,resolve(output,file));
console.log(`Updated unpacked extension in place: ${output}`);
