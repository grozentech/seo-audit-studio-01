import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {audit,limits} from './audit.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4173);
const host=process.env.HOST||'127.0.0.1';
const password=process.env.AUDIT_PASSWORD||'';
const attempts=new Map();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
  const route=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&route.pathname==='/api/config')return json(res,200,{passwordRequired:!!password,limits});
  if(req.method==='POST'&&route.pathname==='/api/audit'){
    if(password&&req.headers['x-audit-password']!==password) return json(res,401,{error:'Incorrect audit password.'});
    const ip=req.socket.remoteAddress||'unknown',now=Date.now();
    const calls=(attempts.get(ip)||[]).filter(t=>now-t<3600000);
    if(calls.length>=12)return json(res,429,{error:'Hourly audit limit reached. Try again later.'});
    calls.push(now);attempts.set(ip,calls);
    let body='';
    try{
      for await(const chunk of req){body+=chunk;if(body.length>10000)throw new Error('Request too large.');}
      const {urls,maxPages}=JSON.parse(body);const output=await audit(urls,maxPages);
      return json(res,200,output);
    }catch(e){return json(res,400,{error:e.message||'Audit failed.'});}
  }
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
  const allowed={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js'};
  const target=allowed[route.pathname];if(!target)return json(res,404,{error:'Not found.'});
  try{const file=await fs.readFile(path.join(here,'public',target));res.writeHead(200,{'Content-Type':types[path.extname(target)],...headers});res.end(file);}
  catch{json(res,500,{error:'File not found.'});}
});
server.requestTimeout=210000;
server.listen(port,host,()=>console.log(`HWA SEO Audit Studio running at http://${host}:${port}`));
