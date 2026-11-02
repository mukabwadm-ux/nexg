/** Static plan/reference checks and design arithmetic only. This is not the application metric engine. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const base=path.dirname(dir);
const read=name=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));
const domain=read('domain-registry.json');
const metrics=new Map(domain.metrics.map(m=>[m.id,m]));
assert.equal(metrics.size,domain.metrics.length);
const sources=read('stats/sources.json');
const sourceIds=new Set(sources.sourceFamilies.map(s=>s.id));
const bindingFile=read('stats/workflow-stats.json');
const bindings=new Map(bindingFile.workflowBindings.map(w=>[w.workflowId,w]));
const predicates=new Map(bindingFile.predicateDefinitions.map(p=>[p.id,p]));
assert.equal(predicates.size,bindingFile.predicateDefinitions.length);
const main=read('profiles-128.json');
const stats=read('stats/profiles-128.json');
const cases=read('stats/scenario-coverage.json');
const expectedWorkflows=new Set(Object.keys(main.workflowShapeReferences));
assert.equal(bindings.size,17);assert.deepEqual(new Set(bindings.keys()),expectedWorkflows);
assert.equal(main.profiles.length,128);assert.equal(stats.profiles.length,128);
assert.equal(new Set(stats.profiles.map(p=>p.subcategoryId)).size,128);
assert.equal(sourceIds.size,8);
const orderBinding=bindings.get('WF_ORDER');
assert(!orderBinding.headlineBindings.some(b=>/review|acceptance/i.test(b.label)));
assert(orderBinding.headlineBindings.some(b=>b.metricId==='confirmed_orders'));
for(const id of ['order_review_required','appointment_confirmation_required','remote_confirmation_required']){
  const p=predicates.get(id);assert.equal(p.visibilityRule,'EXPLICIT_MATCHED_REVIEW_EXCEPTION');
  assert(p.requiredFields.includes('review_exception_rule_id'));
}
assert(!read('acceptance-128.json').acceptanceCases.some(c=>c.expected.intakePolicy==='merchant_confirmation'));
const workflowText=fs.readFileSync(path.join(base,'workflow-catalogue.md'),'utf8');
for(const predicate of predicates.values()){
  assert(expectedWorkflows.has(predicate.workflowId),predicate.id);
  for(const key of ['recordGrain','requiredFields','selection','sourceIds'])assert(predicate[key],`${predicate.id}:${key}`);
  for(const source of predicate.sourceIds)assert(sourceIds.has(source),source);
  // Bindings must name real catalogue states rather than inventing a food-delivery stage.
  const section=workflowText.split(`## ${predicate.workflowId}:`)[1]?.split('\n## ')[0]??'';
  for(const state of predicate.states??[])assert(section.includes(state),`${predicate.id}: unknown state ${state}`);
}
for(const metric of metrics.values()){
  assert.equal(metric.runtimeEnabled,false,metric.id);
  for(const key of ['label','aggregation','numerator','denominator','unit','dateBasis','sourceEvents','authoritativeSource'])assert(metric[key],`${metric.id}:${key}`);
  assert(metric.collection?.requiredFacts?.length,metric.id);
  assert(metric.collection.projectionMode,metric.id);
  assert(metric.collection.drillDownScreen,metric.id);
  for(const id of metric.collection.sourceIds)assert(sourceIds.has(id),`${metric.id}:${id}`);
  assert.equal(metric.collection.runtimeCollectionImplemented,false);
  assert.deepEqual(metric.collection.acceptedConfirmedModes,['NATIVE_CONFIRMED','EXTERNAL_CONFIRMED']);
  assert(metric.collection.importPolicy&&metric.collection.merchantReportedPolicy&&metric.collection.demoPolicy);
}
for(const binding of bindings.values()){
  assert(binding.headlineBindings.length>0,binding.workflowId);
  for(const id of [...binding.chartMetricIds,...binding.insightsMetricIds])assert(metrics.has(id),id);
  for(const row of [...binding.headlineBindings,...binding.alertBindings]){
    assert(metrics.has(row.metricId),row.metricId);
    const predicate=predicates.get(row.predicateId);assert(predicate,row.predicateId);
    assert.equal(predicate.workflowId,binding.workflowId);
    if(row.metricId==='work_due')assert.deepEqual(predicate.periodMembership?.interval,'HALF_OPEN',row.predicateId);
  }
}
for(const profile of main.profiles){
  const p=stats.profiles.find(p=>p.subcategoryId===profile.subcategoryId);assert(p);
  assert.equal(p.screenId,'SC_HOME');assert.equal(p.primaryWorkflowId,profile.primaryWorkflowId);
  assert.equal(profile.statisticsProfileRef,`stats/profiles-128.json#${p.id}`);
  assert.deepEqual(p.baseline.insightsMetricIds,profile.screenConfiguration.SC_INSIGHTS.primaryMetricIds);
  assert.equal(p.conditionalBindings.length,profile.conditionalRules.length);
  assert.deepEqual(p.exclusions,profile.categoryExceptions);
  for(const row of [...p.baseline.headlineBindings,...p.baseline.alertBindings]){
    const metric=metrics.get(row.metricId),predicate=predicates.get(row.predicateId);
    assert.deepEqual(new Set(row.requiredSourceIds),new Set([...metric.collection.sourceIds,...predicate.sourceIds]));
    assert.deepEqual(row.requiredFactRefs,{metricId:metric.id,predicateId:predicate.id});
    assert(stats.evidencePolicies[row.evidencePolicyRef]);
  }
  for(const ref of p.optionalModuleRefs){assert(stats.optionalModules[ref]);for(const id of stats.optionalModules[ref].metricIds)assert(metrics.has(id),id);}
}
const oldCases=read('acceptance-128.json').acceptanceCases;
assert.equal(cases.totalScenarios,oldCases.reduce((n,c)=>n+1+c.variants.length,0));
assert.equal(new Set(cases.scenarios.map(c=>c.scenarioId)).size,cases.scenarios.length);
for(const c of cases.scenarios){
  if(c.modelClarificationRequired)assert.equal(c.homeStatus,'UNCONFIGURED');
  else assert(bindings.has(c.primaryWorkflowId),c.scenarioId);
  assert.equal(c.homePrimaryBinding.workflowId,c.primaryWorkflowId);
  for(const b of c.secondaryBindings)assert(c.enabledWorkflowIds.includes(b.workflowId));
}

function unionLength(intervals){
  const sorted=intervals.map(x=>[...x]).sort((a,b)=>a[0]-b[0]);let total=0,start=null,end=null;
  for(const [a,b]of sorted){assert(b>=a);if(start===null){start=a;end=b;}else if(a<=end)end=Math.max(end,b);else{total+=end-start;start=a;end=b;}}
  return total+(start===null?0:end-start);
}
const ratio=(numerator,denominator)=>({numerator,denominator,value:denominator===0?null:numerator/denominator});
function calculate(c){const i=c.input;switch(c.kind){
  case 'confirmed_distinct':return new Set(i.records.filter(r=>r.confirmed).map(r=>r.workId)).size;
  case 'canonical_roots':return new Set(i.records.map(r=>r.rootId)).size;
  case 'latest_revision':{const map=new Map();for(const r of i.records)if(!map.has(r.workId)||r.revision>map.get(r.workId).revision)map.set(r.workId,r);return [...map.values()].filter(r=>r.state==='COMPLETED').length;}
  case 'cohort_ratio':return ratio(i.outcomes.filter(x=>i.numerator.includes(x)).length,i.outcomes.filter(x=>i.denominator.includes(x)).length);
  case 'ratio_with_outstanding':return {...ratio(i.numerator,i.denominator),outstandingOverdue:i.outstandingOverdue};
  case 'interval_union_ratio':return ratio(unionLength(i.occupiedIntervals),unionLength(i.capacityIntervals));
  case 'grouped_sum':{const sums={};for(const r of i.records)sums[r.unit]=(sums[r.unit]??0)+r.amount;return sums;}
  case 'half_open_period':return i.instants.filter(s=>Date.parse(s)>=Date.parse(i.start)&&Date.parse(s)<Date.parse(i.end)).length;
  case 'evidence_gate':return i.requiredSourceIds.some(x=>!i.availableSourceIds.includes(x))?'NOT_COLLECTED':i.minimumHistory&&!i.historyAvailable?'INSUFFICIENT_HISTORY':'COMPLETE';
  case 'milestone_vs_work':return {milestones:new Set(i.records.map(r=>r.milestoneId)).size,work:new Set(i.records.map(r=>r.workId)).size};
  case 'setup_progress':{const req=i.records.filter(r=>r.required&&r.applicable);const completed=req.filter(r=>r.state==='verified').length;return {completed,remaining:req.length-completed,required:req.length};}
  case 'coverage_gate':return {value:i.complete?i.recordCount:null,quality:i.complete?(i.fresh?'COMPLETE':'STALE'):'PARTIAL'};
  case 'matured_rework_cohort':{const jobs=i.jobs.filter(j=>j.followupEndsAt<=i.cutoff);return ratio(jobs.filter(j=>j.hasRework).length,jobs.length);}
  case 'matured_conversion':{const sessions=i.sessions.filter(s=>s.windowEndsAt<=i.cutoff);return ratio(sessions.filter(s=>s.convertedInsideWindow).length,sessions.length);}
  case 'due_population':return i.milestones.filter(m=>m.confirmed&&!m.cancelled&&m.dueAt>=i.start&&m.dueAt<i.end).length;
  case 'order_confirmation_policy':return i.stock==='UNAVAILABLE'?'OUT_OF_STOCK':i.stock==='UNKNOWN'?'STOCK_CHECK_PENDING':i.reviewRuleEnabled&&i.reviewRuleMatches?'EXCEPTION_REVIEW':'CONFIRMED';
  default:throw new Error(`Unimplemented design calculation ${c.kind}`);
}}
const calculations=read('stats/calculation-cases.json').cases;
for(const c of calculations)assert.deepEqual(calculate(c),c.expected,c.id);
function checkManifestStatistics(manifest){
  const s=manifest.statisticsBindings;assert(s,'Missing statistics bindings');
  for(const w of s.homeWorkflowBindings)assert(bindings.has(w.id),`Unsupported workflow statistics ${w.id}`);
  for(const ref of [...s.homeMetricRefs,...s.insightsMetricRefs])assert(metrics.has(ref.id),`Unsupported metric ${ref.id}`);
  for(const w of s.homeWorkflowBindings)assert(manifest.workflowBindings.some(b=>b.workflow.id===w.id),`Statistics for unconfigured workflow ${w.id}`);
}
const future=read('example-new-category.json');checkManifestStatistics(future);
for(const target of ['homeMetricRefs','insightsMetricRefs']){
  const invalid=structuredClone(future);invalid.statisticsBindings[target].push({id:'unsupported_metric',version:'1.0.0'});
  assert.throws(()=>checkManifestStatistics(invalid),/Unsupported metric/);
}
const badWorkflow=structuredClone(future);badWorkflow.statisticsBindings.homeWorkflowBindings.push({id:'WF_NOT_IMPLEMENTED',version:'1.0.0'});assert.throws(()=>checkManifestStatistics(badWorkflow),/Unsupported workflow/);
const artifacts={};
for(const name of ['domain-registry.json','profiles-128.json','category-manifest.schema.json','example-new-category.json','stats/README.md','stats/collection-contract.md','stats/frontend-and-acceptance.md','stats/sources.json','stats/workflow-stats.json','stats/profiles-128.json','stats/profiles-128.md','stats/scenario-coverage.json','stats/calculation-cases.json','stats/build-statistics.mjs','stats/verify-stats.mjs'])artifacts[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(base,name))).digest('hex');
const report={date:'2026-10-31',status:'STATISTICS_DESIGN_CHECKS_PASSED',scope:'Static registry/profile/predicate/source references and independent design arithmetic examples. No frontend, live collector, provider connection or production calculation executed.',counts:{categories:new Set(stats.profiles.map(p=>p.categoryId)).size,homeProfiles:stats.profiles.length,workflowFamilies:bindings.size,predicates:predicates.size,metricDefinitions:metrics.size,sourceFamilies:sourceIds.size,scenarioExpectations:cases.totalScenarios,independentCalculationCases:calculations.length,futureCategoryStatisticsExamples:1,invalidStatisticsReferencesRejected:3},runtimeStatus:'NOT_IMPLEMENTED_NOT_VERIFIED',artifacts};
fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,...report.counts},null,2));
