import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
const root = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number(process.env.PORT || 4317);
const token = randomBytes(32).toString('hex');
const origin = `http://127.0.0.1:${port}`;
const send = (res, status, data) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
const server = http.createServer(async (req,res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) return send(res,403,{error:'Invalid host.'});
  try {
    if (req.url === '/api/request' && req.method === 'POST') {
      if (req.headers.origin !== origin || req.headers['x-requestbench-token'] !== token) return send(res,403,{error:'Request rejected.'});
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2_000_000) return send(res,413,{error:'Request exceeds 2 MB.'}); }
      const input = JSON.parse(body); const url = new URL(input.url);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) URL without embedded credentials.');
      if (!['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(input.method)) throw new Error('Unsupported method.');
      const headers = new Headers();
      for (const [key,value] of input.headers || []) { if (/^(host|connection|content-length|transfer-encoding|upgrade|proxy-.*)$/i.test(key)) throw new Error(`Header ${key} is managed automatically.`); headers.append(key,value); }
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),30000);
      res.on('close', () => controller.abort());
      const started = performance.now();
      try {
        const response = await fetch(url, {method:input.method,headers,body:['GET','HEAD'].includes(input.method) ? undefined : input.body,redirect:'manual',signal:controller.signal});
        const chunks = []; let size = 0;
        for await (const chunk of response.body || []) { size += chunk.length; if (size > 5_000_000) {controller.abort(); throw new Error('Response exceeds the 5 MB display limit.');} chunks.push(chunk); }
        send(res,200,{status:response.status,statusText:response.statusText,headers:[...response.headers],body:Buffer.concat(chunks).toString('utf8'),size,duration:Math.round(performance.now()-started)});
      } finally { clearTimeout(timer); }
      return;
    }
    if (req.method !== 'GET') return send(res,405,{error:'Method not allowed.'});
    if (req.url === '/api/session') return send(res,200,{token});
    if (req.url === '/api/demo') return send(res,200,{message:'Hello from Requestbench',service:'Local demo API',items:[{id:1,name:'First request',ready:true}]});
    const routes = {'/':'index.html','/app.js':'app.js','/model.js':'model.js','/style.css':'style.css'};
    const file = routes[req.url]; if (!file) return send(res,404,{error:'Not found.'});
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"});
    res.end(await readFile(path.join(root,file)));
  } catch(error) { send(res,400,{error:error.name === 'AbortError' ? 'Request cancelled or timed out after 30 seconds.' : error.message}); }
});
server.listen(port,'127.0.0.1',()=>console.log(`Requestbench is running at ${origin}`));
