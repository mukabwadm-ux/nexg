import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../../..');
const read = async p => JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const paths = {
 profiles:'packages/booking-config/src/data/profiles.json',
 registry:'packages/booking-config/src/data/registry.json',
 offerings:'apps/web/components/merchant/offerings/config.json',
 schemas:'apps/web/components/merchant/offerings/schemas.ts',
 workProfiles:'docs/merchant-portal-plan/work-adaptation/profiles-128.json',
 workViews:'docs/merchant-portal-plan/work-adaptation/workflow-view-catalog.json',
 confirmation:'docs/merchant-portal-plan/order-confirmation.md',
 shell:'apps/web/components/merchant/live-preview-shell.tsx',
 oldAvailability:'docs/merchant-portal-plan/screens/03-availability.md'
};
const profiles = await read(paths.profiles);
const registry = await read(paths.registry);
const offerings = await read(paths.offerings);
const work = await read(paths.workProfiles);
const schemaText = await fs.readFile(path.join(root,paths.schemas),'utf8');
const bridge = [...schemaText.matchAll(/id: '([A-Z_0-9]+)'[\s\S]*?model: '([A-Z_]+)'/g)].map(m=>({schemaId:m[1],modelId:m[2]}));
const views = {
  "ORDER": {
    "renderer": "hours-intake",
    "title": "Operating and order intake",
    "primaryFields": [
      "operating intervals",
      "new-order intake by enabled method",
      "scheduled fulfilment window when configured",
      "last-order cutoff when configured",
      "stock/source status (read-only)"
    ],
    "constraints": [
      "Explicit inventory owner; publication is not stock",
      "Future scheduled intake independent of doors-open state",
      "No generic merchant acceptance"
    ],
    "units": "Stock units stay with inventory; fulfilment-window capacity is a separate typed pool.",
    "variants": [
      "delivery",
      "customer collection",
      "immediate vs scheduled intake"
    ],
    "components": [
      "IntervalTable",
      "IntakeStatus",
      "MethodWindowList",
      "SourceState"
    ]
  },
  "APPOINTMENT": {
    "renderer": "resource-calendar",
    "title": "Appointments and joint resources",
    "primaryFields": [
      "exact service span",
      "eligible staff/provider",
      "actual room/equipment",
      "buffer before/after",
      "notice/step/horizon",
      "breaks and shared busy constraints"
    ],
    "constraints": [
      "All required resource claims must fit",
      "Filtered-out dependency still blocks",
      "Remote access details are private",
      "One root booking counted once"
    ],
    "units": "Exclusive resource time; virtual/group capacity only when explicitly declared.",
    "variants": [
      "on-site",
      "remote provider",
      "private service"
    ],
    "components": [
      "ResourceCalendar",
      "Agenda",
      "EligibilityList",
      "ReservationInspector"
    ]
  },
  "FIELD_VISIT": {
    "renderer": "visit-agenda",
    "title": "Field visits",
    "primaryFields": [
      "visit span",
      "team",
      "coverage/address",
      "travel/setup windows",
      "actual vehicle dependency",
      "location and shared staff constraints"
    ],
    "constraints": [
      "Coverage does not guarantee a free team",
      "No invented emergency arrival guarantee",
      "Required travel uses actual configured rule"
    ],
    "units": "Time per required team/vehicle; distance/coverage is eligibility, not capacity.",
    "variants": [
      "customer-location service",
      "mobile service job"
    ],
    "components": [
      "ResourceCalendar",
      "Agenda",
      "CoverageContext",
      "RoleWindowList"
    ]
  },
  "ASSET_INTERVAL": {
    "renderer": "asset-timeline",
    "title": "Asset reservations and custody",
    "primaryFields": [
      "asset identity",
      "full reserved interval",
      "handover/return",
      "turnaround",
      "in-use/overdue actual custody",
      "maintenance",
      "optional qualified driver"
    ],
    "constraints": [
      "Planned end does not release actual custody",
      "Listing is not individual asset",
      "Open-ended custody renders as ongoing",
      "Unknown source is never free"
    ],
    "units": "Exclusive identified asset interval; typed rental billing unit is not occupancy proof.",
    "variants": [
      "self-drive",
      "with qualified driver",
      "equipment rental"
    ],
    "components": [
      "AssetTimeline",
      "CustodyState",
      "ImpactReview",
      "ReservationInspector"
    ]
  },
  "TRANSFER": {
    "renderer": "trip-agenda",
    "title": "Transfers and meeting services",
    "primaryFields": [
      "pickup/drop-off",
      "trip or greeter window",
      "passenger/luggage fit",
      "actual driver/vehicle",
      "travel/reposition buffer"
    ],
    "constraints": [
      "Meet-and-greet can exclude transport",
      "No airline inventory inferred",
      "Joint driver/vehicle only if required"
    ],
    "units": "Passengers/luggage eligibility separately from exclusive time allocation.",
    "variants": [
      "pickup",
      "drop-off",
      "meet-and-greet without transport"
    ],
    "components": [
      "Agenda",
      "ResourceCalendar",
      "FitSummary",
      "RoleWindowList"
    ]
  },
  "SESSION_CAPACITY": {
    "renderer": "dated-occurrences",
    "title": "Dated sessions and places",
    "primaryFields": [
      "published occurrence date/time",
      "typed place pool",
      "reserved",
      "valid held",
      "remaining",
      "shared instructor/room anchor",
      "booking window"
    ],
    "constraints": [
      "One pool snapshot: reserved + valid held + remaining = total",
      "Anchor claims don't multiply places",
      "No invented undated sessions"
    ],
    "units": "Participant places or explicit seat IDs; booking count differs from participants.",
    "variants": [
      "event ticket",
      "group activity",
      "reserved seats"
    ],
    "components": [
      "OccurrenceList",
      "CapacityBreakdown",
      "ResourceAnchor",
      "SeriesEditor"
    ]
  },
  "SPACE_RESERVATION": {
    "renderer": "space-timeline",
    "title": "Tables and reservable spaces",
    "primaryFields": [
      "actual table/space IDs",
      "party size",
      "compatible combinations",
      "exclusive/shared mode",
      "reservation span",
      "turnover"
    ],
    "constraints": [
      "Only explicitly enabled activity",
      "Combined party claims every physical table",
      "No double allocation through individual and combined views"
    ],
    "units": "Party fit and physical-space exclusivity, or explicitly defined shared places.",
    "variants": [
      "single table",
      "approved combination",
      "exclusive room",
      "shared space"
    ],
    "components": [
      "SpaceTimeline",
      "PartyFit",
      "CombinationInspector",
      "CapacityBreakdown"
    ]
  },
  "TOUR": {
    "renderer": "departure-itinerary",
    "title": "Departures and tour resources",
    "primaryFields": [
      "dated departure",
      "shared places or private interval",
      "guide/vehicle/equipment roles",
      "multi-day leg windows",
      "supplier/source state"
    ],
    "constraints": [
      "Private resources and shared places differ",
      "No assumed transport inclusion",
      "Supplier unknown remains visible"
    ],
    "units": "Shared participant places; private exclusive role intervals kept separate.",
    "variants": [
      "shared departure",
      "private itinerary",
      "multi-day"
    ],
    "components": [
      "OccurrenceList",
      "RoleWindowList",
      "CapacityBreakdown",
      "SupplierState"
    ]
  },
  "PRODUCTION_DUE": {
    "renderer": "workload-due",
    "title": "Production workload and due promises",
    "primaryFields": [
      "due date",
      "production-unit load",
      "lead time",
      "cutoff",
      "working-day calendar",
      "handoff window if enabled",
      "accepted scope"
    ],
    "constraints": [
      "Due date is not appointment",
      "Configured standard cases follow automatic confirmation simulation",
      "Bespoke quote/customer decision remains separate"
    ],
    "units": "Declared production units/workload per time bucket; no sum of incompatible products.",
    "variants": [
      "standard made-to-order",
      "bespoke quoted production"
    ],
    "components": [
      "WorkloadSchedule",
      "CutoffSummary",
      "CapacityBreakdown",
      "Agenda"
    ]
  },
  "REQUEST_QUOTE": {
    "renderer": "response-coverage",
    "title": "Enquiry intake and response coverage",
    "primaryFields": [
      "intake hours",
      "response coverage/estimate",
      "responsible responder",
      "tentative milestones",
      "source status"
    ],
    "constraints": [
      "Enquiry consumes no guaranteed service capacity",
      "Regulated enquiry is not approval",
      "Actual site visit uses separate configured activity"
    ],
    "units": "Response workload only if explicitly modelled; never invented reservable places.",
    "variants": [
      "ordinary quote",
      "regulated enquiry",
      "concierge request"
    ],
    "components": [
      "IntervalTable",
      "ResponseCoverage",
      "TentativeMilestoneList",
      "SourceState"
    ]
  },
  "LINKED_WINDOWS": {
    "renderer": "linked-role-windows",
    "title": "Incoming, processing and outgoing windows",
    "primaryFields": [
      "incoming method/window",
      "processing span/capacity",
      "outgoing method/window",
      "turnaround",
      "firm vs assessment",
      "actual transport roles"
    ],
    "constraints": [
      "Firm promise checks all required roles together",
      "Assessment commits incoming only",
      "Customer drop-off/collection creates no transport"
    ],
    "units": "Measured intake/processing units plus independent time-window claims.",
    "variants": [
      "drop-off/collection",
      "merchant pickup/return",
      "assessment incoming only"
    ],
    "components": [
      "RoleWindowList",
      "CapacityBreakdown",
      "MethodWindowList",
      "ImpactReview"
    ]
  },
  "SERVICE_JOB": {
    "renderer": "job-queue-schedule",
    "title": "Job queue and actual work schedule",
    "primaryFields": [
      "queue vs scheduled intake/work",
      "bay/team window",
      "diagnostic/parts gate if applicable",
      "completion estimate",
      "item/vehicle holding occupancy",
      "mobile variant"
    ],
    "constraints": [
      "Queue isn't fixed start time",
      "Completion estimate is independent",
      "Custody doesn't automatically occupy worker/bay",
      "Field execution needs actual travel constraints"
    ],
    "units": "Jobs, exclusive bay/team time and physical holding capacity are separate.",
    "variants": [
      "walk-in queue",
      "scheduled intake",
      "scheduled work",
      "mobile job"
    ],
    "components": [
      "JobQueue",
      "ResourceCalendar",
      "RoleWindowList",
      "CustodyState"
    ]
  },
  "ENTITLEMENT": {
    "renderer": "access-context",
    "title": "Access hours and covered bookings",
    "primaryFields": [
      "access hours",
      "plan validity",
      "credits context",
      "actual linked child bookings",
      "covered services"
    ],
    "constraints": [
      "Credits aren't places",
      "Plan purchase creates no calendar reservation",
      "Preserve accepted child rights"
    ],
    "units": "Credits/validity separately from child-service time/place capacity.",
    "variants": [
      "membership access",
      "covered trainer/class booking"
    ],
    "components": [
      "IntervalTable",
      "EntitlementContext",
      "ChildBookingList"
    ]
  },
  "FREIGHT": {
    "renderer": "cargo-leg-schedule",
    "title": "Cargo, leg and loading availability",
    "primaryFields": [
      "cargo/leg dates",
      "loading/handling slots",
      "weight",
      "volume",
      "pallet/container dimensions",
      "carrier/source",
      "document/clearance milestones"
    ],
    "constraints": [
      "Separate capacity dimensions",
      "Transit estimate isn't reserved carrier leg",
      "Unknown carrier capacity cannot be confirmed"
    ],
    "units": "kg, cbm, pallet and container tracked independently with declared precision.",
    "variants": [
      "carrier leg",
      "request-only transport",
      "loading appointment"
    ],
    "components": [
      "RoleWindowList",
      "CapacityBreakdown",
      "Agenda",
      "SupplierState"
    ]
  },
  "STORAGE": {
    "renderer": "occupancy-timeline",
    "title": "Storage occupancy and access",
    "primaryFields": [
      "typed occupied quantity",
      "occupancy period",
      "actual release/custody",
      "access/handling slots",
      "unit precision/conversion",
      "capacity source"
    ],
    "constraints": [
      "Area/volume/handling time stay separate",
      "Explicit sqm/sqft conversion only",
      "Planned end doesn't prove actual release"
    ],
    "units": "Declared sqm/sqft/cbm/pallet etc; conversion factor/rounding shown where configured.",
    "variants": [
      "fixed period",
      "ongoing custody",
      "handling/access appointment"
    ],
    "components": [
      "OccupancyTimeline",
      "CapacityBreakdown",
      "CustodyState",
      "Agenda"
    ]
  }
};
assert.equal(profiles.length,128);
assert.equal(new Set(profiles.map(x=>x.subcategoryId)).size,128);
assert.equal(offerings.profiles.length,128);
assert.equal(work.profiles.length,128);
assert.equal(bridge.length,18);
assert.equal(new Set(bridge.map(x=>x.modelId)).size,15);
const modelCases = {"ORDER":["FE-01","FE-02","FE-03","FE-04"],"APPOINTMENT":["FE-05","FE-06","FE-07","FE-14"],"FIELD_VISIT":["FE-18"],"ASSET_INTERVAL":["FE-10","FE-11"],"TRANSFER":["FE-18"],"SESSION_CAPACITY":["FE-08","FE-14"],"SPACE_RESERVATION":["FE-08","FE-09"],"TOUR":["FE-18"],"PRODUCTION_DUE":["FE-17"],"REQUEST_QUOTE":["FE-13"],"LINKED_WINDOWS":["FE-15"],"SERVICE_JOB":["FE-16"],"ENTITLEMENT":["FE-14"],"FREIGHT":["FE-19"],"STORAGE":["FE-19"]};
const stateRef = 'interactions-and-states.md#state-catalogue';
const rows = profiles.map(p=>{
 const o = offerings.profiles.find(x=>x.id===p.subcategoryId);
 const w = work.profiles.find(x=>x.subcategoryId===p.subcategoryId);
 assert.ok(o && w,p.subcategoryId);
 assert.equal(bridge.find(x=>x.schemaId===o.schema)?.modelId,p.defaultModelId,p.subcategoryId);
 assert.deepEqual([...p.candidateModels].sort(),[...w.candidateModels].sort(),p.subcategoryId);
 assert.deepEqual([...p.candidateModels].sort(),[...o.models].sort(),p.subcategoryId);
 const bindings = p.candidateModels.map(modelId=>{
  assert.ok(views[modelId],modelId);
  const b = w.candidateViews.find(x=>x.modelId===modelId);
  assert.ok(b,modelId);
  return {modelId,acceptanceRefs:modelCases[modelId],renderer:views[modelId].renderer,workflowCandidateIds:b.workflowViews.map(x=>x.workflowId),registeredEditorCandidates:bridge.filter(x=>x.modelId===modelId).map(x=>x.schemaId),activation:'Only an explicitly selected configured offering/schema/workflow/method can enable this binding; this list grants no activation.',requiredDisplay:views[modelId].primaryFields,constraints:views[modelId].constraints,unitPolicy:views[modelId].units,variantChoices:views[modelId].variants,viewRef:'view-catalogue.json#'+modelId};
 });
 return {
  subcategoryId:p.subcategoryId,name:p.name,categoryId:p.categoryId,categoryName:p.categoryName,
  status:'FRONTEND_DESIGN_MAPPING_NOT_RUNTIME_ACCEPTANCE',
  defaultSuggestion:{modelId:p.defaultModelId,editorSchemaId:o.schema,renderer:views[p.defaultModelId].renderer,workflowId:w.sourceWorkflowId},
  candidateModels:p.candidateModels,bindings,vocabulary:p.vocabulary,specialtyNeeds:p.specialtyNeeds,
  existingAttributeRefs:o.attributes.map(x=>({id:x.id,target:x.target})),
  existingConditionalRuleRefs:w.effectiveRules.map(x=>({id:x.id,scope:x.scope,requiredQuestionIds:x.requiredQuestionIds,note:x.note})),
  reconciledRuleSource:paths.workProfiles+'#'+w.id,
  ruleUse:'Reference already-reconciled selected-offering conditions for display fixtures; no raw onboarding reinterpretation or onboarding UI changes.',
  onboarding:'DEFERRED_LAST',
  inheritedStateRef:stateRef,
  acceptanceRefs:['FE-12','FE-13','FE-20','FE-22','FE-25','FE-28','FE-30'],
  createsWork:false,runtimeEnabled:false
 };
});
const count = rows.reduce((n,x)=>n+x.bindings.length,0);
assert.equal(count,193);
const categoryCount = new Set(rows.map(x=>x.categoryId)).size;
assert.equal(categoryCount,21);
const data = {status:'FRONTEND_DESIGN_ONLY',date:'2026-10-31',onboarding:'DEFERRED_LAST',profileCount:128,categoryCount,primitiveCount:15,editorSchemaCount:18,candidateBindingCount:count,activationPolicy:'Default/candidate is not enabled. Resolve selected offering, editor, workflow, method, resources, location, source and revision.',profiles:rows};
await fs.writeFile(path.join(out,'profiles-128.json'),JSON.stringify(data,null,2)+'\n');
await fs.writeFile(path.join(out,'view-catalogue.json'),JSON.stringify({status:'FRONTEND_DESIGN_ONLY',schemaBridge:bridge,views},null,2)+'\n');
const clean = x=>String(x).replaceAll('|','/').replaceAll('\n',' ');
const lines = ['# All 128 Availability display profiles','','Status: frontend design mapping only. These rows are not 128 built/tested portals. Onboarding is deferred. Default and candidate values are suggestions; the selected configured offering/method governs activation.','','The shared [view catalogue](view-catalogue.json) provides fields, constraints and unit policies. The [JSON matrix](profiles-128.json) preserves workflow candidates, existing attribute/rule references and per-profile vocabulary. Every row inherits the full [state catalogue](interactions-and-states.md#state-catalogue).','','| # | Category / subcategory | Default editor → view | Conditional model candidates | Specialty-specific display needs |','| --- | --- | --- | --- | --- |'];
rows.forEach((x,i)=>lines.push('| '+(i+1)+' | '+clean(x.categoryName+' / '+x.name)+' ('+x.subcategoryId+') | '+x.defaultSuggestion.editorSchemaId+' → '+x.defaultSuggestion.renderer+' | '+x.candidateModels.join(', ')+' | '+clean(x.specialtyNeeds)+' |'));
await fs.writeFile(path.join(out,'profiles-128.md'),lines.join('\n')+'\n');
const sources = await Promise.all(Object.entries(paths).map(async ([name,p])=>({name,path:p,sha256:crypto.createHash('sha256').update(await fs.readFile(path.join(root,p))).digest('hex')})));
await fs.writeFile(path.join(out,'source-manifest.json'),JSON.stringify({date:'2026-10-31',status:'READ_ONLY_INPUT_SNAPSHOT',registryRevision:registry.revision,offeringsRevision:offerings.revision,scope:'Availability frontend design only; onboarding last; no application/backend/provider/discovery changes.',sources},null,2)+'\n');
const countsByDefault = Object.fromEntries(Object.keys(views).map(k=>[k,rows.filter(x=>x.defaultSuggestion.modelId===k).length]));
const report={status:'STRUCTURAL_DESIGN_VERIFICATION_ONLY',date:'2026-10-31',checks:{uniqueProfiles:rows.length,categories:categoryCount,candidateBindings:count,primitiveDescriptors:Object.keys(views).length,editorBridges:bridge.length,defaultEditorModelAgreement:true,profileOfferingsWorkCandidateAgreement:true,everyCandidateHasWorkflowReference:rows.every(x=>x.bindings.every(y=>y.workflowCandidateIds.length)),everyProfileHasSpecialtyNeeds:rows.every(x=>!!x.specialtyNeeds),everyProfileHasStateReference:true},countsByDefault,interactiveFrontendTested:false,applicationChanged:false,onboardingChanged:false,backendChanged:false,images:'Verified separately after generation'};
await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
