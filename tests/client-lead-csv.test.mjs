import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLeadCsv, leadCsv } from '../src/lib/clientLeadCsv.ts'
import { parsePremisesSelection, premisesLabel } from '../src/lib/premisesCatalog.ts'
import { applyEmailMergeFields, CLIENT_EMAIL_MERGE_FIELD_KEYS } from '../src/lib/emailMergeFields.ts'
const options=[{code:'office',label:'Office',active:true},{code:'other',label:'Other',active:true},{code:'old',label:'Old',active:false}]
const base={business_name:'Example, Pty Ltd',first_name:'Jane',last_name:'Smith',email:'jane@example.com',phone:'0400123456',address:'1 Test St',suburb:'Sydney',postcode:'2000',city:'sydney',premises_type:'Office',contact_basis:'enquiry',notes:'Line one\nLine "two"'}
test('CSV round trip preserves commas quotes newlines and normalizes industry labels',()=>{const rows=parseLeadCsv(leadCsv([base]),options);assert.deepEqual(rows[0].errors,[]);assert.equal(rows[0].record.business_name,base.business_name);assert.equal(rows[0].record.notes,base.notes);assert.equal(rows[0].input.premisesType,'office')})
test('CSV detects duplicate rows and invalid fields',()=>{const rows=parseLeadCsv(leadCsv([base,base,{...base,email:'bad',postcode:'3000',premises_type:'old'}]),options);assert.match(rows[1].errors.join(),/Duplicate/);assert.match(rows[2].errors.join(),/email/);assert.match(rows[2].errors.join(),/Postcode/);assert.match(rows[2].errors.join(),/inactive/)})
test('CSV rejects missing headers malformed quoting and excess rows',()=>{assert.throws(()=>parseLeadCsv('a,b\n1,2',options),/headers/);assert.throws(()=>parseLeadCsv('first_name,email,postcode,city,contact_basis\n"bad',options),/unclosed/);assert.throws(()=>parseLeadCsv(leadCsv(Array(201).fill(base)),options),/200/)})
test('CSV exports protect formula prefixes',()=>{assert.match(leadCsv([{...base,business_name:'=HYPERLINK("bad")'}]),/"'=HYPERLINK/)} )
test('other requires a description and resolves as industry',()=>{assert.throws(()=>parsePremisesSelection({premisesType:'other'}),/Describe/);assert.equal(premisesLabel('other','Exhibition space',options),'Exhibition space');assert.equal(premisesLabel('office','',options),'Office');assert.equal(CLIENT_EMAIL_MERGE_FIELD_KEYS.has('industry'),true);assert.equal(applyEmailMergeFields('Hello <<industry>>',{industry:'Office'}),'Hello Office');assert.equal(applyEmailMergeFields('<<industry>>',{}),'')})
