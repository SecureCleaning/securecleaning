import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLeadCsv, leadCsv, normalizeExcludedLeadCsvRows, partitionLeadCsvRows } from '../src/lib/clientLeadCsv.ts'
import { parsePremisesSelection, premisesLabel } from '../src/lib/premisesCatalog.ts'
import { applyEmailMergeFields, CLIENT_EMAIL_MERGE_FIELD_KEYS } from '../src/lib/emailMergeFields.ts'
const options=[{code:'office',label:'Office',active:true},{code:'other',label:'Other',active:true},{code:'old',label:'Old',active:false}]
const base={business_name:'Example, Pty Ltd',first_name:'Jane',last_name:'Smith',email:'jane@example.com',phone:'0400123456',address:'1 Test St',suburb:'Sydney',postcode:'2000',city:'sydney',premises_type:'Office',contact_basis:'enquiry',notes:'Line one\nLine "two"'}
test('CSV round trip preserves commas quotes newlines and normalizes industry labels',()=>{const rows=parseLeadCsv(leadCsv([base]),options);assert.deepEqual(rows[0].errors,[]);assert.equal(rows[0].record.business_name,base.business_name);assert.equal(rows[0].record.notes,base.notes);assert.equal(rows[0].input.premisesType,'office')})
test('CSV detects duplicate rows and invalid fields',()=>{const rows=parseLeadCsv(leadCsv([base,base,{...base,email:'bad',postcode:'3000',premises_type:'old'}]),options);assert.match(rows[1].errors.join(),/Duplicate/);assert.match(rows[2].errors.join(),/email/);assert.match(rows[2].errors.join(),/Postcode/);assert.match(rows[2].errors.join(),/inactive/)})
test('CSV rejects missing headers malformed quoting and excess rows',()=>{assert.throws(()=>parseLeadCsv('a,b\n1,2',options),/headers/);assert.throws(()=>parseLeadCsv('first_name,email,postcode,city,contact_basis\n"bad',options),/unclosed/);assert.throws(()=>parseLeadCsv(leadCsv(Array(201).fill(base)),options),/200/)})
test('CSV exports protect formula prefixes',()=>{assert.match(leadCsv([{...base,business_name:'=HYPERLINK("bad")'}]),/"'=HYPERLINK/)} )
test('other requires a description and resolves as industry',()=>{assert.throws(()=>parsePremisesSelection({premisesType:'other'}),/Describe/);assert.equal(premisesLabel('other','Exhibition space',options),'Exhibition space');assert.equal(premisesLabel('office','',options),'Office');assert.equal(CLIENT_EMAIL_MERGE_FIELD_KEYS.has('industry'),true);assert.equal(applyEmailMergeFields('Hello <<industry>>',{industry:'Office'}),'Hello Office');assert.equal(applyEmailMergeFields('<<industry>>',{}),'')})

test('CSV defaults blank or omitted first names to Manager without replacing supplied names',()=>{
 const row=parseLeadCsv(leadCsv([{...base,first_name:'   '}]),options)[0]
 assert.deepEqual(row.errors,[]);assert.equal(row.input.firstName,'Manager')
 const omitted=parseLeadCsv('email,postcode,city,contact_basis\njane@example.com,2000,NSW,Client enquiry',options)[0]
 assert.equal(omitted.input.firstName,'Manager');assert.deepEqual(omitted.errors,[])
 assert.equal(parseLeadCsv(leadCsv([base]),options)[0].input.firstName,'Jane')
})
test('CSV accepts readable intake labels and Childcare centre while retaining provider validation',()=>{
 const catalog=[...options,{code:'childcare',label:'Childcare',active:true}]
 const row=parseLeadCsv(leadCsv([{...base,source_type:' Cold Outreach ',contact_basis:'Relevant published business contact',source_provider:'Public business directory',premises_type:'Childcare centre'}]),catalog)[0]
 assert.deepEqual(row.errors,[]);assert.equal(row.input.sourceType,'cold_outreach');assert.equal(row.input.contactBasis,'inferred_business_interest');assert.equal(row.input.premisesType,'childcare')
 const missing=parseLeadCsv(leadCsv([{...base,source_type:'Purchased Lead',contact_basis:'Purchased lead provider'}]),catalog)[0]
 assert.match(missing.errors.join(),/Source provider is required/)
 assert.equal(parseLeadCsv(leadCsv([{...base,source_type:'Manual entry',contact_basis:'Existing business relationship'}]),catalog)[0].input.contactBasis,'existing_relationship')
})
test('CSV rejects unknown contact basis and inactive aliases with actionable errors',()=>{
 const row=parseLeadCsv(leadCsv([{...base,source_type:'Unknown',contact_basis:'',premises_type:'Childcare centre'}]),[...options,{code:'childcare',label:'Childcare',active:false}])[0]
 assert.match(row.errors.join(),/Invalid source_type.*Use:/);assert.match(row.errors.join(),/Invalid contact_basis.*Use:/);assert.match(row.errors.join(),/inactive premises type/)
 const exact=parseLeadCsv(leadCsv([{...base,premises_type:'Childcare centre'}]),[...options,{code:'childcare',label:'Childcare',active:true},{code:'custom_childcare',label:'Childcare centre',active:true}])[0]
 assert.equal(exact.input.premisesType,'custom_childcare')
})

test('website-sourced leads normalize without treating public contact details as an enquiry',()=>{
 const row=parseLeadCsv(leadCsv([{...base,first_name:'',source_type:'Official website',contact_basis:'Public business contact',source_provider:'Example organisation',source_reference:'https://example.com/contact',premises_type:'Childcare centre'}]),[...options,{code:'childcare',label:'Childcare',active:true}])[0]
 assert.deepEqual(row.errors,[])
 assert.equal(row.input.firstName,'Manager');assert.equal(row.input.sourceType,'cold_outreach');assert.equal(row.input.contactBasis,'inferred_business_interest')
 assert.equal(row.input.sourceProvider,'Example organisation');assert.equal(row.input.sourceReference,'https://example.com/contact')
})

test('CSV import exclusions retain valid rows and hold error rows for later review',()=>{
 const rows=parseLeadCsv(leadCsv([base,{...base,email:'bad-email'}]),options)
 const excludedRows=normalizeExcludedLeadCsvRows([3,3])
 const selection=partitionLeadCsvRows(rows,excludedRows)
 assert.deepEqual(excludedRows,[3]);assert.deepEqual(selection.included.map(row=>row.row),[2]);assert.deepEqual(selection.excluded.map(row=>row.row),[3])
 assert.deepEqual(selection.included[0].errors,[]);assert.match(selection.excluded[0].errors.join(),/email/)
 assert.throws(()=>normalizeExcludedLeadCsvRows([1]),/invalid/);assert.throws(()=>normalizeExcludedLeadCsvRows(['3']),/invalid/)
})

