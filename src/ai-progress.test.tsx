import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import AiProgress from './AiProgress';
import {aiFailure} from './ai-progress';
const actions={onRetry:()=>{},onSettings:()=>{},onLocal:()=>{},onDismiss:()=>{}};
test('provider HTTP errors are classified by status rather than generic advice in the message',()=>{
 const message=(status:number)=>`OpenAI returned HTTP ${status}. Check your API key, model access, and API quota.`;
 assert.match(aiFailure(message(401)).title,/authenticate/);
 assert.match(aiFailure(message(429)).title,/usage limit/);
 assert.match(aiFailure(message(403)).title,/access/);
 assert.match(aiFailure(message(500)).title,/temporarily unavailable/);
 assert.match(aiFailure('OpenAI request timed out after 90 seconds').title,/timed out/);
 assert.match(aiFailure('Could not reach OpenAI.').title,/Connection/);
 assert.match(aiFailure('AI selected an unknown endpoint').title,/generation failed/);
});
test('working state renders indeterminate activity with status semantics and no false completion',()=>{
 const html=renderToStaticMarkup(<AiProgress {...actions} state={{phase:'working',startedAt:Date.now()-35000,model:'test-model',count:12}}/>);
 assert.match(html,/role="status"/);assert.match(html,/ai-spinner/);assert.match(html,/ai-progress-track/);assert.match(html,/12 matching APIs/);assert.match(html,/Still waiting/);assert.doesNotMatch(html,/Workflow ready/);
});
test('failure renders persistent error details and recovery actions; completion distinguishes no matches',()=>{
 const html=renderToStaticMarkup(<AiProgress {...actions} state={{phase:'error',message:'HTTP 401'}}/>);
 assert.match(html,/role="alert"/);assert.match(html,/Retry OpenAI request/);assert.match(html,/Use local search/);assert.match(html,/HTTP 401/);
 assert.match(renderToStaticMarkup(<AiProgress {...actions} state={{phase:'success',steps:2}}/>),/2 API steps are ready/);
 assert.match(renderToStaticMarkup(<AiProgress {...actions} state={{phase:'success',steps:0}}/>),/no matching workflow/);
 assert.equal(renderToStaticMarkup(<AiProgress {...actions} state={{phase:'idle'}}/>),'');
});
