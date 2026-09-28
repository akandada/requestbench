import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBundle,exportBundle,interpolate} from '../public/model.js';
const workspace=()=>({format:'requestbench',version:1,requests:[{id:'r',name:'Example',method:'POST',url:'{{base}}/items',headers:[],body:'{"ok":true}'}],environments:[{id:'e',name:'Local',variables:[{key:'base',value:'http://localhost',enabled:true},{key:'token',value:'test-secret',secret:true}]}],fixtures:[{id:'f',name:'Example body',kind:'request',body:'{"ok":true}'}]});
test('JSON export round trip preserves requests and fixtures, omits secret values',()=>{const state=workspace();const out=validateBundle(JSON.parse(JSON.stringify(exportBundle(state))));assert.deepEqual(out.requests,state.requests);assert.deepEqual(out.fixtures,state.fixtures);assert.equal(out.environments[0].variables[1].value,'');assert.equal(state.environments[0].variables[1].value,'test-secret');});
test('explicit secret export preserves values',()=>assert.equal(exportBundle(workspace(),true).environments[0].variables[1].value,'test-secret'));
test('variables resolve across text with whitespace',()=>assert.equal(interpolate('{{ base }}/items/{{id}}',[{key:'base',value:'http://localhost'},{key:'id',value:'42'}]),'http://localhost/items/42'));
test('missing and disabled variables fail before request dispatch',()=>{assert.throws(()=>interpolate('{{token}}',[]),/Missing/);assert.throws(()=>interpolate('{{token}}',[{key:'token',value:'x',enabled:false}]),/Missing/);});
test('malformed bundles and header rows are rejected',()=>{assert.throws(()=>validateBundle({}),/version/);const data=workspace();data.requests[0].headers=[null];assert.throws(()=>validateBundle(data),/Keys/);});
