import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export async function startServer(port=0){
  const server=createServer(async(req,res)=>{
    const raw=(req.url??'').split('?')[0];
    const path=raw==='/'?'index.html':raw.slice(1);
    if(!['GET','HEAD'].includes(req.method)||!(/^(?:index\.html|icon\.svg|src\/[a-z-]+\.(?:js|css))$/.test(path))){res.writeHead(404);res.end('Not found');return;}
    try{const content=await readFile(resolve(root,path));const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(path)];res.writeHead(200,{'Content-Type':`${mime}; charset=utf-8`,'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:content);}catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
  return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise((done,reject)=>server.close(e=>e?reject(e):done()))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT??4173);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid PORT');const server=await startServer(port);console.log(`Release Rehearsal: ${server.url}`);}
