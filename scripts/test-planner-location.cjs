const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=fs.readFileSync('app/map/PlanMyDayDrawer.tsx','utf8');
const code=ts.transpileModule(source.slice(source.indexOf('async function getOrigin('),source.indexOf('function rankJobs(')),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const origin=nav=>new Function('navigator','BASE_POINT',code+';return getOrigin;')(nav,{lat:40.69,lng:-73.83});
(async()=>{
assert.equal((await origin({})('office')).label,'Richmond Hill office');
await assert.rejects(origin({})('current_location'),/Location unavailable/);
await assert.rejects(origin({geolocation:{getCurrentPosition(ok,fail){fail();}}})('current_location'),/Could not get your location/);
const result=await origin({geolocation:{getCurrentPosition(ok,fail,options){assert.equal(options.maximumAge,30000);assert.equal(options.timeout,10000);ok({coords:{latitude:40.7,longitude:-73.9}});}}})('current_location');
assert.deepEqual(result.point,{lat:40.7,lng:-73.9});assert.equal(result.label,'your current location');
console.log('PASS: fresh location, denied/unavailable errors, office only when explicit');
})().catch(error=>{console.error(error);process.exitCode=1;});
