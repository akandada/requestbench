import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
const origin='http://127.0.0.1:4318';let child,token,target,targetOrigin;
before(async()=>{
 target=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;if(req.url==='/redirect'){res.writeHead(302,{Location:'/echo'});res.end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({method:req.method,body,auth:req.headers.authorization}));});await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));targetOrigin=`http://127.0.0.1:${target.address().port}`;
 child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'4318'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error(`Server exited ${code}`)));});token=(await (await fetch(origin+'/api/session')).json()).token;
});
after(async()=>{child?.kill();await new Promise(resolve=>target.close(resolve));});
const request=(payload,headers={})=>fetch(origin+'/api/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Requestbench-Token':token,...headers},body:JSON.stringify(payload)});
test('local request engine sends body and auth and returns response metrics',async()=>{const response=await request({url:targetOrigin+'/echo',method:'POST',headers:[['Authorization','Bearer test-token']],body:'{"hello":"world"}'});const data=await response.json();assert.equal(data.status,200);assert.deepEqual(JSON.parse(data.body),{method:'POST',body:'{"hello":"world"}',auth:'Bearer test-token'});assert.ok(data.size>0);assert.ok(data.duration>=0);});
test('cross-origin callers and missing session tokens are rejected',async()=>{assert.equal((await request({}, {Origin:'https://untrusted.example'})).status,403);assert.equal((await request({}, {'X-Requestbench-Token':''})).status,403);});
test('file protocol is rejected',async()=>{const response=await request({url:'file:///etc/passwd',method:'GET'});assert.equal(response.status,400);assert.match((await response.json()).error,/HTTP/);});
test('redirects are surfaced without forwarding credentials',async()=>{const data=await (await request({url:targetOrigin+'/redirect',method:'GET'})).json();assert.equal(data.status,302);});
