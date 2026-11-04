import assert from 'node:assert/strict'
import test from 'node:test'

import { preserveTypedStreetNumber } from '../src/lib/addressGeocoding.ts'

test('address suggestions retain a typed street number when the provider returns only the road', () => {
  assert.equal(
    preserveTypedStreetNumber(
      '100 Sunnyholt Rd',
      'Sunnyholt Road, Blacktown, Sydney, New South Wales, 2148',
      { road: 'Sunnyholt Road' },
    ),
    '100 Sunnyholt Road, Blacktown, Sydney, New South Wales, 2148',
  )
})

test('address suggestions do not duplicate a provider-supplied street number', () => {
  assert.equal(
    preserveTypedStreetNumber(
      '100 Sunnyholt Rd',
      '100 Sunnyholt Road, Blacktown, Sydney, New South Wales, 2148',
      { house_number: '100', road: 'Sunnyholt Road' },
    ),
    '100 Sunnyholt Road, Blacktown, Sydney, New South Wales, 2148',
  )
})

test('a typed street number is not attached to an unrelated suggestion', () => {
  assert.equal(
    preserveTypedStreetNumber(
      '100 Sunnyholt Rd',
      'Sunnybank Road, Blacktown, Sydney, New South Wales, 2148',
      { road: 'Sunnybank Road' },
    ),
    'Sunnybank Road, Blacktown, Sydney, New South Wales, 2148',
  )
})

import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { matchesAddressLocality } from '../src/lib/addressGeocoding.ts'

function addressFixture({ blocked = false, results = [] } = {}) {
  const calls=[], limits=[], exports={}
  const code=ts.transpileModule(readFileSync(new URL('../src/lib/addressGeocoding.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  vm.runInNewContext(code,{exports,URL,AbortSignal,process:{env:{}},require(name){
    assert.equal(name,'./abuseProtection');return {rateLimitValue:async(...args)=>{limits.push(args);return blocked?{}:null}}
  },fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>results}}})
  return {...exports,calls,limits}
}

test('address matching requires the selected suburb, postcode and state',()=>{
 const match={suburb:'Scoresby',postcode:'3179',state:'Victoria'}
 assert.ok(matchesAddressLocality(match,{suburb:' scoresby ',postcode:'3179'},'melbourne'))
 assert.ok(matchesAddressLocality({...match,state:'VIC'},{suburb:'Scoresby',postcode:'3179'},'melbourne'))
 for(const change of [{suburb:'Knoxfield'},{postcode:'3180'},{state:'NSW'},{state:null}]) {
   assert.equal(matchesAddressLocality({...match,...change},{suburb:'Scoresby',postcode:'3179'},'melbourne'),false)
 }
})

test('scoped address lookup keeps street numbers and excludes wrong-locality results',async()=>{
 const result={display_name:'Burwood Highway, Scoresby, Victoria, 3179, Australia',address:{road:'Burwood Highway',suburb:'Scoresby',state:'Victoria',postcode:'3179'}}
 const fixture=addressFixture({results:[result,{...result,address:{...result.address,suburb:'Knoxfield'}},{...result,address:{...result.address,state:'New South Wales'}}]})
 const found=await fixture.searchAustralianAddresses('1 Burwood Hwy','melbourne',5,{suburb:'Scoresby',postcode:'3179'})
 assert.equal(found.length,1);assert.equal(found[0].streetAddress,'1 Burwood Highway')
 assert.equal(new URL(fixture.calls[0].url).searchParams.get('q'),'1 Burwood Hwy, Scoresby 3179, Melbourne, Australia')
 assert.equal(fixture.calls[0].options.cache,'force-cache')
 assert.equal(fixture.limits[0][1].limit,1)
 assert.ok(fixture.limits[0][1].windowMs>=1000)
})

test('address provider throttling prevents an outbound request and permits manual fallback',async()=>{
 const fixture=addressFixture({blocked:true})
 await assert.rejects(()=>fixture.searchAustralianAddresses('1 Burwood Hwy','melbourne'),/busy/)
 assert.equal(fixture.calls.length,0)
 assert.equal(await fixture.verifyAddressCoordinates('1 Burwood Hwy','Scoresby','3179','melbourne'),null)
})
