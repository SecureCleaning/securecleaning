import test from 'node:test';
import assert from 'node:assert/strict';
import sanitizeHtml from 'sanitize-html';
import { sanitizeProductDescription } from '../src/lib/productDescription.ts';
import { sanitizeRichEmailHtml } from '../src/lib/richEmailServer.ts';

test('discard regions do not reopen on implied ancestor closes',()=>{
  const input='<div><noscript></div><a href="https://example.invalid/hidden">Hidden</a></noscript>';
  const output=sanitizeHtml(input,{allowedTags:['div','a'],allowedAttributes:{a:['href']},nonTextTags:['script','style','textarea','option','noscript']});
  assert.doesNotMatch(output,/Hidden|example.invalid/);
});
test('application sanitizers retain formatting and reject active namespaces and refresh',()=>{
  for(const sanitize of [sanitizeProductDescription,sanitizeRichEmailHtml]){
    const out=sanitize('<p><strong>Safe</strong></p><svg><animate attributeName="href" values="javascript:alert(1)"/></svg><meta http-equiv="refresh" content="0;url=javascript:alert(1)"><a href="javascript:alert(1)">Link</a>');
    assert.match(out,/<strong>Safe<\/strong>/);assert.doesNotMatch(out,/javascript:|<svg|<animate|<meta/i);
  }
  const table='<table role="presentation" style="width:100%"><tbody><tr><td style="color:#123456;padding:8px"><strong>Hello</strong></td></tr></tbody></table>';
  const clean=sanitizeRichEmailHtml(table);assert.match(clean,/<table/);assert.match(clean,/color:#123456/);assert.match(clean,/padding:8px/);assert.equal(sanitizeRichEmailHtml(clean),clean);
});
