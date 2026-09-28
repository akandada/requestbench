import {id,validateBundle,exportBundle,interpolate} from './model.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = 'requestbench.workspace.v1';
const initial = {format:'requestbench',version:1,requests:[{id:id(),name:'Hello, Requestbench',method:'GET',url:'{{base_url}}/api/demo',headers:[],body:''}],environments:[{id:id(),name:'Local development',variables:[{key:'base_url',value:location.origin,enabled:true,secret:false}]}],fixtures:[{id:id(),name:'Create a customer',kind:'request',body:JSON.stringify({name:'Alex Morgan',email:'alex@example.com'},null,2)}]};
let state = initial; try {const stored = localStorage.getItem(key); if(stored) state=validateBundle(JSON.parse(stored));} catch {alert('Stored workspace could not be loaded. Export any backup before importing it again.');}
let view='requests', selected=state.requests[0]?.id, envId=state.environments[0]?.id, tab='headers', responseTab='body', responses=new Map(), sending=false, controller;
let sessionToken;
const sessionReady=fetch('/api/session').then(r=>r.json()).then(r=>sessionToken=r.token);
function persist(){try {localStorage.setItem(key,JSON.stringify(state));}catch{toast('Device storage is full. Export your workspace to keep your changes.');}}
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4500);}
function current(){return state[view].find(x=>x.id===selected);}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function render(){
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('#request-count').textContent=state.requests.length;
  $('#list-title').textContent={requests:'SAVED REQUESTS',environments:'ENVIRONMENTS',fixtures:'JSON FIXTURES'}[view];
  $('#eyebrow').textContent={requests:'REQUEST WORKSPACE',environments:'ENVIRONMENT VARIABLES',fixtures:'REUSABLE PAYLOADS & SAMPLES'}[view];
  $('#heading').textContent={requests:'Make the connection.',environments:'One request. Any environment.',fixtures:'Good data, ready to reuse.'}[view];
  $('#environment').innerHTML='<option value="">No environment</option>'+state.environments.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');$('#environment').value=envId||'';
  $('#items').innerHTML=state[view].map(x=>`<button class="item ${x.id===selected?'selected':''}" data-id="${esc(x.id)}"><span class="${view==='requests'?'method '+x.method.toLowerCase():'tag'}">${view==='requests'?x.method:view==='fixtures'?(x.kind==='request'?'REQ':'RES'):'ENV'}</span><span class="item-name">${esc(x.name)}</span></button>`).join('')||'<p class="hint">Add your first item with +.</p>';
  document.querySelectorAll('.item').forEach(b=>b.onclick=()=>{selected=b.dataset.id;render();});
  renderEditor();
}
function renderEditor(){const item=current();if(!item){$('#editor').innerHTML='<div class="empty"><strong>A fresh workspace</strong>Use + to add your first '+view.slice(0,-1)+'.</div>';return;}
  const title=`<div class="title-line"><input class="request-name" id="name" aria-label="Item name" value="${esc(item.name)}"><button id="export-item">Export JSON</button><button id="delete" class="danger" aria-label="Delete item">Delete</button></div>`;
  if(view==='requests'){
    $('#editor').innerHTML=title+`<div class="url-row"><select id="method" aria-label="HTTP method">${['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m=>`<option ${m===item.method?'selected':''}>${m}</option>`).join('')}</select><input id="url" aria-label="Request URL" placeholder="https://api.example.com/v1/users" value="${esc(item.url)}"><button id="send" class="primary">${sending?'Cancel':'Send ↗'}</button></div><div class="tabs">${['headers','body','auth'].map(t=>`<button data-tab="${t}" class="${tab===t?'active':''}">${{headers:'Headers',body:'Body',auth:'Authorization'}[t]}</button>`).join('')}</div><div class="pane" id="pane"></div><section class="response" id="response"></section>`;
    $('#method').onchange=e=>{item.method=e.target.value;persist();render();};$('#url').oninput=e=>{item.url=e.target.value;persist();};$('#send').onclick=sendRequest;
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderEditor();});renderPane(item);renderResponse(item);
  } else if(view==='environments'){
    $('#editor').innerHTML=title+'<p class="hint">Reference variables anywhere in a request with {{variable_name}}. Mark credentials as secret to omit their values from shared exports.</p><div id="rows"></div><button id="add-row">＋ Add variable</button><p class="hint">Changes save automatically on this device. Secret fields are masked, not encrypted.</p>';
    renderRows(item.variables,true);$('#add-row').onclick=()=>{item.variables.push({key:'',value:'',enabled:true,secret:false});persist();renderEditor();};
  }else{
    $('#editor').innerHTML=title+`<div class="toolbar"><select id="fixture-kind" aria-label="Fixture type"><option value="request" ${item.kind==='request'?'selected':''}>Request body</option><option value="response" ${item.kind==='response'?'selected':''}>Response sample</option></select><button id="format">Format JSON</button></div><textarea id="fixture-body" class="fixture-body" aria-label="Fixture JSON" spellcheck="false">${esc(item.body)}</textarea><p class="hint">Request fixtures can be loaded from a request’s Body tab. Response fixtures preserve samples for sharing.</p>`;
    $('#fixture-kind').onchange=e=>{item.kind=e.target.value;persist();render();};$('#fixture-body').oninput=e=>{item.body=e.target.value;persist();};$('#format').onclick=()=>format(item,'body');
  }
  $('#name').onchange=e=>{item.name=e.target.value.trim()||'Untitled';persist();render();};
  $('#delete').onclick=()=>{if(confirm(`Delete “${item.name}”?`)){state[view]=state[view].filter(x=>x.id!==item.id);if(envId===item.id)envId='';selected=state[view][0]?.id;persist();render();}};
  $('#export-item').onclick=()=>{const data=exportBundle({requests:[],environments:[],fixtures:[],[view]:[item]});download(data,`${item.name.replace(/[^a-z0-9_-]/gi,'-')}.json`);toast('Exported. Secret environment values omitted.');};
}
function renderRows(rows,isEnv=false){$('#rows').innerHTML=rows.map((r,i)=>`<div class="row"><input type="checkbox" aria-label="Enable row ${i+1}" data-field="enabled" data-i="${i}" ${r.enabled!==false?'checked':''}><input aria-label="Key ${i+1}" placeholder="${isEnv?'Variable':'Header'}" data-field="key" data-i="${i}" value="${esc(r.key)}"><input aria-label="Value ${i+1}" placeholder="Value" type="${isEnv&&r.secret?'password':'text'}" data-field="value" data-i="${i}" value="${esc(r.value)}">${isEnv?`<label class="check"><input type="checkbox" data-field="secret" data-i="${i}" ${r.secret?'checked':''}>Secret</label>`:''}<button data-remove="${i}" aria-label="Remove row ${i+1}">×</button></div>`).join('')||'<p class="hint">No entries yet.</p>';
  $('#rows').querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{rows[el.dataset.i][el.dataset.field]=el.type==='checkbox'?el.checked:el.value;persist();if(el.dataset.field==='secret')renderRows(rows,isEnv);});
  $('#rows').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.remove),1);persist();renderRows(rows,isEnv);});
}
function renderPane(item){
 if(tab==='headers'){$('#pane').innerHTML='<div id="rows"></div><button id="add-row">＋ Add header</button>';renderRows(item.headers);$('#add-row').onclick=()=>{item.headers.push({key:'',value:'',enabled:true});persist();renderPane(item);};}
 if(tab==='body'){$('#pane').innerHTML=`<div class="toolbar"><select id="load-fixture" aria-label="Load request fixture"><option value="">Load a request fixture…</option>${state.fixtures.filter(f=>f.kind==='request').map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select><div class="actions"><button id="save-fixture">Save as fixture</button><button id="format">Format JSON</button></div></div><textarea id="body" rows="8" aria-label="Request body" spellcheck="false">${esc(item.body)}</textarea><p class="hint">Raw request body · supports {{variables}}. GET and HEAD requests do not send a body.</p>`;$('#body').oninput=e=>{item.body=e.target.value;persist();};$('#format').onclick=()=>format(item,'body');$('#load-fixture').onchange=e=>{const f=state.fixtures.find(f=>f.id===e.target.value);if(f){item.body=f.body;persist();renderPane(item);toast('Fixture loaded into request body.');}};$('#save-fixture').onclick=()=>saveFixture(item.body,'request',item.name+' body');}
 if(tab==='auth'){$('#pane').innerHTML=`<label for="auth">Bearer token or environment variable</label><div class="row auth-row"><input id="auth" type="password" placeholder="{{api_token}}" value="${esc(item.bearer||'')}"></div><p class="hint">Use {{api_token}} with a secret environment variable to keep exported requests shareable. When set, this replaces any Authorization header.</p>`;$('#auth').oninput=e=>{item.bearer=e.target.value;persist();};}
}
function format(item,field){try{item[field]=JSON.stringify(JSON.parse(item[field]),null,2);persist();renderEditor();toast('JSON formatted.');}catch(e){toast('Invalid JSON: '+e.message);}}
function saveFixture(body,kind,name){try{JSON.parse(body);}catch{toast('Fixtures require valid JSON.');return;}state.fixtures.push({id:id(),name,kind,body});persist();toast('Saved to fixtures.');}
function renderResponse(item){const r=responses.get(item.id);if(!r){$('#response').innerHTML='<div class="response-top"><span class="response-title">Response</span><span class="hint">Ready when you are</span></div><div class="empty"><strong>Your next response starts here.</strong>Send a request to inspect its status, headers, and body.</div>';return;}
 if(r.loading){$('#response').innerHTML='<div class="empty">Sending request…</div>';return;}if(r.error){$('#response').innerHTML=`<div class="error">${esc(r.error)}</div>`;return;}
 let body=r.body;try{body=JSON.stringify(JSON.parse(body),null,2);}catch{}
 $('#response').innerHTML=`<div class="response-top"><span class="response-title">Response</span><div class="metrics"><span class="status">${r.status} ${esc(r.statusText)}</span><span>${r.duration} ms</span><span>${(r.size/1024).toFixed(2)} KB</span></div><button id="save-response">Save fixture</button></div><div class="tabs"><button data-response-tab="body" class="${responseTab==='body'?'active':''}">Body</button><button data-response-tab="headers" class="${responseTab==='headers'?'active':''}">Headers</button></div><pre>${esc(responseTab==='body'?(body||'(empty body)'):r.headers.map(([k,v])=>`${k}: ${v}`).join('\n'))}</pre>`;
 $('#save-response').onclick=()=>saveFixture(r.body,'response',item.name+' response');document.querySelectorAll('[data-response-tab]').forEach(b=>b.onclick=()=>{responseTab=b.dataset.responseTab;renderResponse(item);});
}
async function sendRequest(){if(sending){controller?.abort();return;}const item=current();try{
 const vars=state.environments.find(e=>e.id===envId)?.variables||[];const expand=s=>interpolate(s,vars);
 const headers=item.headers.filter(h=>h.enabled!==false&&h.key.trim()).map(h=>[expand(h.key),expand(h.value)]);
 if(item.bearer){for(let i=headers.length-1;i>=0;i--)if(headers[i][0].toLowerCase()==='authorization')headers.splice(i,1);headers.push(['Authorization','Bearer '+expand(item.bearer)]);}
 const body=expand(item.body);if(body&&!headers.some(([k])=>k.toLowerCase()==='content-type')){try{JSON.parse(body);headers.push(['Content-Type','application/json']);}catch{}}
 const payload={url:expand(item.url),method:item.method,headers,body};new URL(payload.url);
 sending=true;controller=new AbortController();responses.set(item.id,{loading:true});renderEditor();await sessionReady;
 const result=await fetch('/api/request',{method:'POST',headers:{'Content-Type':'application/json','X-Requestbench-Token':sessionToken},body:JSON.stringify(payload),signal:controller.signal});responses.set(item.id,await result.json());
 }catch(e){responses.set(item.id,{error:e.name==='AbortError'?'Request cancelled.':e.message});}finally{sending=false;renderEditor();}}
$('#environment').onchange=e=>envId=e.target.value;
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;selected=state[view][0]?.id;render();});
$('#add').onclick=()=>{const item=view==='requests'?{id:id(),name:'Untitled request',method:'GET',url:'',headers:[],body:''}:view==='environments'?{id:id(),name:'New environment',variables:[]}:{id:id(),name:'New fixture',kind:'request',body:'{}'};state[view].push(item);selected=item.id;persist();render();$('#name').focus();$('#name').select();};
$('#export').onclick=()=>{$('#include-secrets').checked=false;$('#export-dialog').showModal();};
$('#download').onclick=()=>{download(exportBundle(state,$('#include-secrets').checked),'requestbench-workspace.json');$('#export-dialog').close();toast('Workspace exported.');};
$('#import').onclick=()=>$('#file').click();$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5_000_000)throw new Error('Import must be smaller than 5 MB.');const data=validateBundle(JSON.parse(await file.text()));for(const kind of ['requests','environments','fixtures'])state[kind].push(...data[kind].map(item=>({...item,id:id()})));persist();if(!selected)selected=state[view][0]?.id;render();toast(`Imported ${data.requests.length} requests, ${data.environments.length} environments, and ${data.fixtures.length} fixtures.`);}catch(error){toast(error.message);}finally{e.target.value='';}};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&view==='requests'&&current()){e.preventDefault();sendRequest();}});
render();
