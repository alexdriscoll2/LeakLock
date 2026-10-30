import { extensionDirectory } from '../paths.mjs';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=extensionDirectory();
await build({entryPoints:['dev/demo.ts'],outfile:'dev/demo.js',bundle:true,format:'iife',target:'chrome120'});
const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/dev/bridge.js'){res.setHeader('content-type','text/javascript');res.end(await readFile('dev/bridge.js'));return;}
    if(path==='/demo.html' || path==='/demo.js'){res.setHeader('content-type',path.endsWith('.html')?'text/html':'text/javascript');res.setHeader('cache-control','no-store');res.end(await readFile('dev'+path));return;}
    const file=resolve(root,'.'+(path==='/'?'/options.html':path));
    if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    const type={'.html':'text/html','.css':'text/css','.js':'text/javascript'}[extname(file)] || 'text/plain';
    let data=await readFile(file);
    if(type==='text/html')data=Buffer.from(data.toString().replace('<script src="ui.js">','<script src="/dev/bridge.js"></script><script src="ui.js">'));
    res.setHeader('content-type',type);res.setHeader('cache-control','no-store');res.end(data);
  } catch {res.writeHead(404).end('Not found');}
});
server.listen(4178,'127.0.0.1',()=>console.log('Sample-data UI preview: http://127.0.0.1:4178'));
