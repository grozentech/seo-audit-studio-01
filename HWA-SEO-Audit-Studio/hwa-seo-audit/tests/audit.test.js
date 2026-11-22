import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInput,inspectHTML,robotsPolicy,audit} from '../audit.js';

test('public URL normalization and blocked internal hosts',()=>{
  assert.equal(normalizeInput('example.com/blog?x=1#foo'),'https://example.com/blog');
  for(const input of ['http://localhost/','http://127.0.0.1/','http://10.0.0.1/','ftp://example.com','https://example.com:8443/','https://a.local/','https://user:pass@example.com']) assert.throws(()=>normalizeInput(input));
});
test('HTML source inspection handles metadata, links, headings, images',()=>{
  const raw=`<!doctype html><html lang="en"><head><title>Studio &amp; Services</title><meta name="description" content="Good services"><meta name="viewport" content="width=device-width"><link rel="canonical" href="/services"></head><body><h1>Hello</h1><img src="a.jpg"><img src="decor.jpg" alt=""><a href="/pricing#now">Pricing</a><a href="https://other.com">Other</a></body></html>`;
  const result=inspectHTML(raw,'https://sample.example/services');
  assert.equal(result.title,'Studio & Services');assert.equal(result.description,'Good services');assert.equal(result.canonical,'https://sample.example/services');assert.equal(result.h1Count,1);assert.equal(result.missingAlt,1);assert.equal(result.images,2);assert.equal(result.lang,'en');assert.equal(result.viewport,true);assert.deepEqual(result.internalLinks,['https://sample.example/pricing']);
});
test('robots allow overrides broader disallow',()=>{
  const policy=robotsPolicy('User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /tmp');
  assert.equal(policy('/private/client'),false);assert.equal(policy('/private/public/'),true);assert.equal(policy('/hello'),true);
});
test('audit input validates range without using network',async()=>{
  await assert.rejects(()=>audit(['example.com','https://www.example.com','third.example','fourth.example']),/1 to 3/);
  await assert.rejects(()=>audit(['example.com'],100),/1 to 20/);
  await assert.rejects(()=>audit(['example.com','http://example.com']),/different domain/);
});
