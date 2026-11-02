import React, { useMemo, useRef, useState } from "react";
import {
  BUSINESS_TYPES,
  CATEGORY_BY_ID,
  CORE_DOCUMENTS,
  FULFILLMENT_LABELS,
  KENYA_COUNTIES,
  MERCHANT_CATEGORIES,
  normalizeInitialCapture
} from "./merchantCategories";
import { assessOnboardingAnswers, resolveOnboardingSelection } from "../../packages/booking-config/src/onboarding";
import { capturedOffers, hasOfferDetails, normalizePhone, validateCapture, validateRegistration } from "./capture";
import RegistryQuestions from "./RegistryQuestions";
import OnboardingHome from "./OnboardingHome";
import OnboardingWorkspace from "./OnboardingWorkspace";
import "./merchant-onboarding.css";

const STEPS = [
  { id: "business", label: "Business profile" },
  { id: "offer", label: "Offerings and specialties" },
  { id: "location", label: "Locations and fulfilment" },
  { id: "operations", label: "Availability and resources" },
  { id: "documents", label: "Documents" },
  { id: "payout", label: "Payout and policies" }
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const FILE_LIMIT = 10 * 1024 * 1024;
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
function EmbeddedWorkspace({ children }) { return <>{children}</>; }

const makeId = () => globalThis.crypto?.randomUUID?.() || `offer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const blankHours = () => Object.fromEntries(DAYS.map(day => [day, { open: false, from: "09:00", to: "17:00" }]));
const newOffer = (subcategory = "") => ({
  id: makeId(), subcategory, name: "", description: "", priceMode: "fixed", price: "",
  priceUnit: "each", availability: "in_stock", attributes: {}
});
const initialForm = () => ({
  business: { name: "", legalName: "", firstName: "", lastName: "", ownerName: "", phone: "", email: "", type: "", registrationNumber: "", branchCount: 1, registered: null, sameBusinessPhone: true, businessPhone: "", marketing: false },
  categoryId: "",
  subcategories: [],
  answersBySubcategory: {},
  offers: [newOffer()],
  location: { address: "", town: "", county: "", postalCode: "", mapLat: "", mapLng: "", coverageModes: [], serviceAreas: "" },
  operations: {
    hours: blankHours(), prepMin: "", prepMax: "", peakCapacity: "", pickerMinutes: "",
    slotCapacity: "", turnaroundHours: "", responseSlaHours: "", jobDurationMinutes: "",
    bookingEnabled: false, booking: { slotMinutes: "", horizonDays: "", capacityPerSlot: "", cutoffHours: "", cancellationPolicy: "" },
    rental: { minimumDays: "", turnaroundHours: "", handoverChecklist: "" },
    freight: { cutoffs: "", capacity: "", transitEstimate: "", milestonesEnabled: false },
    pharmacy: { pharmacistReviewHours: "", coldChainEnabled: false },
    additionalNotes: ""
  },
  packaging: { method: "", instructions: "", tamperEvident: false, temperatureAware: false, riderHandoff: "" },
  compliance: { kraPin: "", etimsReady: false, conditionalChecks: [] },
  payout: { method: "", holderName: "", tillNumber: "", paybillNumber: "", accountReference: "", mobileProvider: "M-Pesa", mobileNumber: "", bankName: "", bankBranch: "", bankAccount: "" },
  policies: { cancellation: "", returns: "", complaintContact: "", accurate: false, terms: false }
});

function mergeForm(base, incoming) {
  if (!incoming) return base;
  return {
    ...base, ...incoming,
    business: { ...base.business, ...incoming.business },
    location: { ...base.location, ...incoming.location },
    operations: {
      ...base.operations, ...incoming.operations, hours: { ...base.operations.hours, ...incoming.operations?.hours },
      booking: { ...base.operations.booking, ...incoming.operations?.booking },
      rental: { ...base.operations.rental, ...incoming.operations?.rental },
      freight: { ...base.operations.freight, ...incoming.operations?.freight },
      pharmacy: { ...base.operations.pharmacy, ...incoming.operations?.pharmacy }
    },
    packaging: { ...base.packaging, ...incoming.packaging },
    compliance: { ...base.compliance, ...incoming.compliance },
    payout: { ...base.payout, ...incoming.payout },
    policies: { ...base.policies, ...incoming.policies },
    answersBySubcategory: { ...base.answersBySubcategory, ...incoming.answersBySubcategory },
    offers: incoming.offers?.length ? incoming.offers : base.offers
  };
}

function Field({ spec, value, onChange, error, id }) {
  const controlId = id || spec.id;
  const common = { id: controlId, name: controlId, value: value ?? "", onChange: e => onChange(e.target.value), required: spec.required, "aria-required": spec.required, "aria-invalid": Boolean(error), "aria-describedby": error ? `${controlId}-error` : undefined };
  return <div className={`mo-field ${error ? "has-error" : ""}`}>
    {spec.type === "checkbox" ? <label className="mo-check"><input id={controlId} type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} aria-invalid={Boolean(error)} /><span>{spec.label}{spec.required && <span className="mo-required"> *</span>}{spec.help ? ` - ${spec.help}` : ""}</span></label>
      : <><label htmlFor={controlId}>{spec.label}{spec.required && <span className="mo-required"> *</span>}</label>
    {spec.type === "textarea" ? <textarea {...common} rows={3} placeholder={spec.help} />
      : spec.type === "select" ? <select {...common}><option value="">Select</option>{(spec.options || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
      : <input {...common} type={["number", "email", "tel"].includes(spec.type) ? spec.type : "text"} min={spec.type === "number" ? "0" : undefined} placeholder={spec.help} />}
    </>}
    {error && <span id={`${controlId}-error`} className="mo-error" role="alert">{error}</span>}
  </div>;
}

function UploadField({ id, label, required, file, error, onChange }) {
  return <div className={`mo-upload ${error ? "has-error" : ""}`}>
    <label htmlFor={id}>{label}{required && <span className="mo-required"> *</span>}</label>
    <input id={id} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={onChange} />
    <small>{file ? `Selected: ${file.name}` : "PDF, JPG or PNG; maximum 10 MB."}</small>
    {error && <span className="mo-error" role="alert">{error}</span>}
  </div>;
}

function CheckGroup({ label, options, value = [], onChange, error, required = false }) {
  const toggle = id => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  return <fieldset className={`mo-fieldset ${error ? "has-error" : ""}`}>
    <legend>{label}{required && <span className="mo-required"> *</span>}</legend>
    <div className="mo-check-grid">{options.map(option => <label className="mo-check" key={option.id}>
      <input type="checkbox" checked={value.includes(option.id)} onChange={() => toggle(option.id)} />
      <span>{option.label}</span>
    </label>)}</div>
    {error && <span className="mo-error" role="alert">{error}</span>}
  </fieldset>;
}

function SubcategoryPicker({ options, value = [], onChange, error, required = false }) {
  const selected = options.filter(option => value.includes(option.id));
  const toggle = id => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  return <fieldset className={`mo-fieldset mo-subcategory-field ${error ? "has-error" : ""}`}>
    <legend>Subcategories (select all that apply){required && <span className="mo-required"> *</span>}</legend>
    <details className="mo-subcategory-picker">
      <summary aria-label="Choose business subcategories">
        <span className="mo-subcategory-selection">
          {selected.length ? selected.map(option => <span className="mo-subcategory-chip" key={option.id}>{option.label}</span>) : <span className="mo-subcategory-placeholder">Choose one or more subcategories</span>}
        </span>
        <span className="mo-subcategory-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="mo-subcategory-options">
        {options.map(option => <label className="mo-check" key={option.id}>
          <input type="checkbox" checked={value.includes(option.id)} onChange={() => toggle(option.id)} />
          <span>{option.label}</span>
        </label>)}
      </div>
    </details>
    {error && <span className="mo-error" role="alert">{error}</span>}
  </fieldset>;
}

function StatusPanel({ status: suppliedStatus, onStatusChange, needsResubmission = false }) {
  const status=({draft:"Draft",pending:"Submitted",changes_requested:"Action Required",approved:"Approved",rejected:"Rejected"})[suppliedStatus]||suppliedStatus;
  const known = ["Submitted","Under Review","Action Required","Conditionally Approved","Approved","Restricted","Rejected"];
  return <section className="mo-status" aria-live="polite">
    <div><span className="mo-kicker">Application status</span><h2>{needsResubmission ? "Resubmission needed" : status || "Draft"}</h2></div>
    <p>{needsResubmission ? "Your saved changes need to be submitted before this revision can be approved." : status === "Draft" ? "Complete the basic registration and submit it to request review." : status === "Submitted" ? "Your application is submitted. You can continue setup while waiting for admin approval." : status === "Approved"
      ? "Your workspace is approved. Complete applicable setup before separate activation."
      : status === "Action Required"
        ? "Review the verification request, update the requested details/documents and resubmit."
        : status === "Conditionally Approved"
          ? "Some services may be enabled. Restricted or unverified branches remain unavailable."
          : status === "Rejected"
            ? "Review the decision reason and use the support or appeal route configured by the platform."
            : "The platform team will review your business, activity-specific documents and operational setup."}</p>
    {onStatusChange && <label className="mo-field">Demo review status
      <select value={status || "Submitted"} onChange={e => onStatusChange(e.target.value)}>{known.map(s => <option key={s}>{s}</option>)}</select>
    </label>}
  </section>;
}

export default function MerchantOnboarding({
  initialData,
  onSubmit,
  onSaveDraft,
  onSaveTask,
  onTaskNavigation,
  onDemo,
  onExitDemo,
  savedHome,
  initialHome = false,
  embedded = false,
  applicationStatus,
  onStatusChange,
  onBackToMarketplace,
  previewMode = false,
  authenticatedSession,
  className = ""
}) {
  const [form, setForm] = useState(() => mergeForm(initialForm(), normalizeInitialCapture(initialData)));
  const [files, setFiles] = useState({});
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [showHome, setShowHome] = useState(initialHome);
  const [taskEditing, setTaskEditing] = useState(false);
  const categoryDrafts = useRef({});
  const savedForm = useRef(form);
  const WorkspaceShell = embedded ? EmbeddedWorkspace : OnboardingWorkspace;
  const setupSession = authenticatedSession?.otpVerified === true && authenticatedSession?.signedIn === true;
  const category = CATEGORY_BY_ID[form.categoryId];
  const selection = useMemo(() => {
    const resolved = resolveOnboardingSelection(form.categoryId, form.subcategories);
    return { ...resolved, profiles: resolved.profiles.map(profile => ({ ...profile,
      name: CATEGORY_BY_ID[form.categoryId]?.subcategoryOptions.find(item => item.id === profile.subcategoryId)?.name || profile.name
    })) };
  }, [form.categoryId, form.subcategories]);
  const assessments = useMemo(() => assessOnboardingAnswers(selection, form.answersBySubcategory, {
    otpVerified: setupSession, signedIn: setupSession
  }), [selection, form.answersBySubcategory, setupSession]);
  const visibleStatus = applicationStatus || submittedStatus;

  const fulfillmentOptions = useMemo(() => (category?.fulfillment || []).map(id => ({
    id, label: FULFILLMENT_LABELS[id] || id
  })), [category]);
  const deliverySelected = form.location.coverageModes.some(mode => ["rider_delivery", "rider_collection_return", "freight_pickup"].includes(mode));
  const packagingVisible = Boolean(category && category.packaging !== "none" && deliverySelected);
  const bookingConditionMet = Boolean(category?.bookingWhen?.some(x => form.subcategories.includes(x)));
  const bookingControlVisible = category?.booking === "conditional" && bookingConditionMet;
  const bookingActive = Boolean(category && (category.booking === "required" || (bookingControlVisible && form.operations.bookingEnabled)));

  const setTop = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const setGroup = (group, key, value) => {
    setForm(current => ({ ...current, [group]: { ...current[group], [key]: value } }));
    const path = `${group}.${key}`;
    setErrors(current => {
      const remaining = { ...current };
      delete remaining[path];
      return remaining;
    });
    if (Object.keys(errors).length && Object.keys(errors).every(field => field === path)) setNotice("");
  };
  const setNested = (group, parent, key, value) => setForm(current => ({
    ...current, [group]: { ...current[group], [parent]: { ...current[group][parent], [key]: value } }
  }));
  const setOffer = (offerId, key, value) => setForm(current => ({
    ...current, offers: current.offers.map(o => o.id === offerId ? { ...o, [key]: value } : o)
  }));
  const setOfferAttribute = (offerId, key, value) => setForm(current => ({
    ...current, offers: current.offers.map(o => o.id === offerId ? { ...o, attributes: { ...o.attributes, [key]: value } } : o)
  }));

  function handleFile(docId, event) {
    const file = event.target.files?.[0];
    setErrors(current => ({ ...current, [`files.${docId}`]: "" }));
    if (!file) return;
    if (!FILE_TYPES.includes(file.type)) {
      setErrors(current => ({ ...current, [`files.${docId}`]: "Use a PDF, JPG or PNG file." }));
      event.target.value = "";
      return;
    }
    if (file.size > FILE_LIMIT) {
      setErrors(current => ({ ...current, [`files.${docId}`]: "File must be 10 MB or smaller." }));
      event.target.value = "";
      return;
    }
    setFiles(current => ({ ...current, [docId]: file }));
  }

  function updateSubcategories(selected) {
    setForm(current => ({
      ...current,
      subcategories: selected,
      offers: current.offers.map(offer => !offer.subcategory && !hasOfferDetails(offer)
        ? { ...offer, subcategory: selected[0] || "" } : offer)
    }));
    setNotice(taskEditing && form.offers.some(hasOfferDetails) ? "Your listing details are kept. Listings for unselected activities stay inactive until you select that activity again." : "");
  }

  function changeCategory(categoryId) {
    if (categoryId === form.categoryId) return;
    categoryDrafts.current[form.categoryId] = {
      subcategories: form.subcategories, offers: form.offers, operations: form.operations,
      coverageModes: form.location.coverageModes, packaging: form.packaging,
      conditionalChecks: form.compliance.conditionalChecks
    };
    const restored = categoryDrafts.current[categoryId];
    const blank = initialForm();
    setForm(current => ({
      ...current, categoryId, subcategories: restored?.subcategories || [],
      offers: restored?.offers || [newOffer()], operations: restored?.operations || blank.operations,
      location: { ...current.location, coverageModes: restored?.coverageModes || [] },
      packaging: restored?.packaging || blank.packaging,
      compliance: { ...current.compliance, conditionalChecks: restored?.conditionalChecks || [] }
    }));
    setErrors({});
    setNotice(taskEditing ? "Details for your previous category are kept in this tab. Select it again to restore them. Your business details and selected files are unchanged." : "");
  }

  function stepErrors(index = step, includeConsent = false) {
    const result = validateCapture(form, category, index, { includeConsent });
    if (index === 1) for (const assessment of assessments) {
      const value = form.answersBySubcategory[assessment.subcategoryId]?.[assessment.questionId];
      const supplied = value !== undefined && value !== null && (typeof value !== "string" || value.trim() !== "");
      if (assessment.state === "invalid" && supplied) {
        result[`answers.${assessment.subcategoryId}.${assessment.questionId}`] = assessment.messages.join(" ");
      }
    }
    return result;
  }
  function payload(includeFiles = false) {
    const cat = CATEGORY_BY_ID[form.categoryId];
    const activeAnswers = {};
    for (const assessment of assessments) {
      if (assessment.state === "inactive") continue;
      const value = form.answersBySubcategory[assessment.subcategoryId]?.[assessment.questionId];
      if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) continue;
      activeAnswers[assessment.subcategoryId] ||= {};
      activeAnswers[assessment.subcategoryId][assessment.questionId] = value;
    }
    return {
      schemaVersion: 2, registryRevision: selection.revision, country: "KE", currency: "KES", categoryId: form.categoryId,
      categoryName: cat?.name || "", subcategories: form.subcategories,
      answersBySubcategory: form.answersBySubcategory,
      activeAnswersBySubcategory: activeAnswers,
      business: { ...form.business, ownerName: `${form.business.firstName} ${form.business.lastName}`.trim(), phone: normalizePhone(form.business.phone),
        businessPhone: form.business.sameBusinessPhone ? normalizePhone(form.business.phone) : form.business.businessPhone },
      offers: capturedOffers(form.offers).map(offer => ({ ...offer,
        activityState: !offer.subcategory ? "unassigned" : form.subcategories.includes(offer.subcategory) ? "active" : "inactive"
      })),
      location: form.location,
      operations: { ...form.operations, bookingActive },
      packaging: packagingVisible ? form.packaging : null,
      compliance: form.compliance,
      payout: { ...form.payout, mobileNumber: form.payout.method === "mobile_money" ? normalizePhone(form.payout.mobileNumber) : "" },
      policies: form.policies,
      documents: includeFiles ? files : Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { name: file.name, type: file.type, size: file.size }]))
    };
  }

  async function submit() {
    const allErrors = taskEditing ? stepErrors(step, false) : validateRegistration(form, category);
    setErrors(allErrors);
    if (Object.keys(allErrors).length) {
      setNotice(taskEditing ? "Check the highlighted details you entered. Unfinished setup can wait." : "Complete the highlighted business and contact details to continue.");
      return;
    }
    if (taskEditing) {
      if (!previewMode && !onSaveTask) { setNotice("This task has not been saved. Your edits are still here."); return; }
      setSubmitting(true);
      try {
        if (onSaveTask) await onSaveTask(payload(true), { step });
        savedForm.current = form;
        setShowHome(true);setTaskEditing(false);setNotice("");
      } catch(error) {setNotice(error?.message || "Your edits could not be saved. They are still here.");}
      finally {setSubmitting(false);}
      return;
    }
    if (!onSubmit) {
      setNotice("Submission is not available yet. Your entries are kept in this tab.");
      return;
    }
    setSubmitting(true);
    setNotice("");
    try {
      const result = await onSubmit(payload(true));
      if (result?.preview === true) {
        setShowHome(true);
        setNotice("");
        return;
      }
      if (!result?.status || !result?.applicationId) throw new Error("Submission has not been confirmed. Your entries are still here.");
      if(result.redirecting){setNotice("Application saved. Opening your workspace…");return;}
      setSubmittedStatus(result.status);
      savedForm.current = form;
      setShowHome(true);
      setNotice(`Application ${result.applicationId}: ${result.status}.`);
    } catch (error) {
      setNotice(error?.message || "Submission failed. Your entries are still here; please retry.");
    } finally { setSubmitting(false); }
  }

  function fieldError(path) { return errors[path] || ""; }
  function renderField(spec, value, onChange, path) {
    const fieldSpec = { ...spec, required: Boolean(spec.entryRequired || (setupSession && spec.required)) };
    return <Field key={path} id={`field-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`} spec={fieldSpec} value={value} onChange={onChange} error={fieldError(path)} />;
  }
  function renderRegistration() {
    return <section className="mo-panel mo-registration">
      <fieldset className="mo-fieldset mo-registration-identity">
        <legend>Your business and name</legend>
        <div className="mo-grid mo-registration-identity-grid">
          {renderField({id:"business-name",label:"Business name",entryRequired:true},form.business.name,v=>setGroup("business","name",v),"business.name")}
          {renderField({id:"first-name",label:"First name",entryRequired:true},form.business.firstName,v=>setGroup("business","firstName",v),"business.firstName")}
          {renderField({id:"last-name",label:"Last name",entryRequired:true},form.business.lastName,v=>setGroup("business","lastName",v),"business.lastName")}
        </div>
      </fieldset>
      <fieldset className="mo-fieldset mo-registration-activities">
        <legend>Business activities</legend>
        <div className="mo-field mo-registration-category">
          <label htmlFor="category">Business category <span className="mo-required">*</span></label>
          <select id="category" value={form.categoryId} required aria-invalid={Boolean(fieldError("categoryId"))} onChange={e=>changeCategory(e.target.value)}><option value="">Select a category</option>{MERCHANT_CATEGORIES.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select>
          {fieldError("categoryId")&&<span className="mo-error">{fieldError("categoryId")}</span>}
        </div>
        {category&&<SubcategoryPicker required options={category.subcategoryOptions.map(item=>({id:item.id,label:item.name}))} value={form.subcategories} onChange={updateSubcategories} error={fieldError("subcategories")} />}
      </fieldset>
      <fieldset className="mo-fieldset mo-registration-contact">
        <legend>Contact details</legend>
        <div className="mo-grid mo-registration-contact-grid">
          {renderField({id:"branch-count",label:"Number of branches",type:"number",entryRequired:true},form.business.branchCount,v=>setGroup("business","branchCount",v),"business.branchCount")}
          {renderField({id:"email",label:"Business email",type:"email",entryRequired:true},form.business.email,v=>setGroup("business","email",v),"business.email")}
          {renderField({id:"phone",label:"Mobile phone",type:"tel",entryRequired:true,help:"Kenyan mobile number, e.g. 0712 345 678"},form.business.phone,v=>setGroup("business","phone",v),"business.phone")}
        </div>
      </fieldset>
      <fieldset className="mo-fieldset mo-registration-phone">
        <legend>Business contact number</legend>
        <label className="mo-check"><input type="checkbox" checked={form.business.sameBusinessPhone} onChange={e=>setGroup("business","sameBusinessPhone",e.target.checked)} /><span>Use my mobile number as the business contact number.</span></label>
        {!form.business.sameBusinessPhone&&renderField({id:"business-phone",label:"Business contact number",type:"tel",entryRequired:true},form.business.businessPhone,v=>setGroup("business","businessPhone",v),"business.businessPhone")}
      </fieldset>
      <fieldset className="mo-fieldset mo-registration-policy">
        <legend>Registration and policies</legend>
        <div className="mo-field"><label htmlFor="business-registered">Is your business registered? <span className="mo-required">*</span></label><select id="business-registered" value={form.business.registered === null ? "" : String(form.business.registered)} required aria-invalid={Boolean(fieldError("business.registered"))} onChange={e=>setGroup("business","registered",e.target.value === "" ? null : e.target.value === "true")}><option value="">Choose Yes or No</option><option value="true">Yes</option><option value="false">No</option></select>{fieldError("business.registered")&&<span className="mo-error">{fieldError("business.registered")}</span>}<small>Either answer can continue.</small></div>
        <label className="mo-check"><input type="checkbox" checked={form.policies.terms} required aria-invalid={Boolean(fieldError("policies.terms"))} onChange={e=>setGroup("policies","terms",e.target.checked)} /><span>I accept the merchant platform terms and data processing notice.</span></label>
        {fieldError("policies.terms")&&<span className="mo-error">{fieldError("policies.terms")}</span>}
      </fieldset>
      <fieldset className="mo-fieldset mo-registration-marketing">
        <legend>Product updates</legend>
        <label className="mo-check"><input type="checkbox" checked={form.business.marketing} onChange={e=>setGroup("business","marketing",e.target.checked)} /><span>Send me product updates and marketing messages. Optional.</span></label>
      </fieldset>
    </section>;
  }
  function renderStep() {
    if (!previewMode && step === 0) return renderRegistration();
    if (step === 0) return <section className="mo-panel">
      <div className="mo-panel-heading"><span className="mo-kicker">Setup details</span><h2>Business and contact</h2><p>Start with your contact details. You can add the rest of your setup now or return to it from Home.</p></div>
      <div className="mo-grid">
        {renderField({ id:"business-name",label:"Business name",entryRequired:true },form.business.name,v=>setGroup("business","name",v),"business.name")}
        {renderField({ id:"first-name",label:"First name",entryRequired:true },form.business.firstName,v=>setGroup("business","firstName",v),"business.firstName")}
        {renderField({ id:"last-name",label:"Last name",entryRequired:true },form.business.lastName,v=>setGroup("business","lastName",v),"business.lastName")}
        {renderField({ id:"phone",label:"Mobile phone",entryRequired:true,help:"Kenyan mobile number, e.g. 0712 345 678" },form.business.phone,v=>setGroup("business","phone",v),"business.phone")}
        {renderField({ id:"email",label:"Business email",type:"email",entryRequired:true },form.business.email,v=>setGroup("business","email",v),"business.email")}
        {renderField({ id:"branch-count",label:"Number of branches",type:"number",entryRequired:true },form.business.branchCount,v=>setGroup("business","branchCount",v),"business.branchCount")}
        <div className="mo-field"><label htmlFor="business-registered">Is your business registered? <span className="mo-required">*</span></label><select id="business-registered" value={form.business.registered === null ? "" : String(form.business.registered)} onChange={e=>setGroup("business","registered",e.target.value === "" ? null : e.target.value === "true")} aria-invalid={Boolean(fieldError("business.registered"))}><option value="">Choose Yes or No</option><option value="true">Yes</option><option value="false">No</option></select>{fieldError("business.registered")&&<span className="mo-error">{fieldError("business.registered")}</span>}<small>Either answer can continue. This does not verify registration.</small></div>
        <div className="mo-field"><label htmlFor="business-type">Business structure <span className="mo-optional">Optional</span></label><select id="business-type" value={form.business.type} onChange={e=>setGroup("business","type",e.target.value)}><option value="">Choose later</option>{BUSINESS_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
        {renderField({ id:"legal-name",label:"Registered legal name",help:"Optional if different from trading name" },form.business.legalName,v=>setGroup("business","legalName",v),"business.legalName")}
        {renderField({ id:"registration-number",label:"Registration number",help:"Required later for registered entities" },form.business.registrationNumber,v=>setGroup("business","registrationNumber",v),"business.registrationNumber")}
      </div>
      <label className="mo-check"><input type="checkbox" checked={form.business.sameBusinessPhone} onChange={e=>setGroup("business","sameBusinessPhone",e.target.checked)} /><span>Use my mobile number as the business contact number.</span></label>
      {!form.business.sameBusinessPhone && renderField({id:"business-phone",label:"Business contact number",entryRequired:true},form.business.businessPhone,v=>setGroup("business","businessPhone",v),"business.businessPhone")}
      <label className="mo-check"><input type="checkbox" checked={form.business.marketing} onChange={e=>setGroup("business","marketing",e.target.checked)} /><span>Send me product updates and marketing messages. Optional.</span></label>
    </section>;

    if (step === 1) return <section className="mo-panel">
      <div className="mo-panel-heading"><span className="mo-kicker">Setup details</span><h2>Category, subcategory and offer</h2><p>Choose the merchant's activities, then add products or services customers will see.</p></div>
      <div className="mo-field"><label htmlFor="category">Business category <span className="mo-required">*</span></label><select id="category" value={form.categoryId} onChange={e=>changeCategory(e.target.value)}><option value="">Select a category</option>{MERCHANT_CATEGORIES.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select>{fieldError("categoryId")&&<span className="mo-error">{fieldError("categoryId")}</span>}</div>
      {category && <>
        <CheckGroup label="Subcategories (select all that apply)" required options={category.subcategoryOptions.map(x=>({id:x.id,label:x.name}))} value={form.subcategories} onChange={updateSubcategories} error={fieldError("subcategories")} />
        <RegistryQuestions selection={selection} answers={form.answersBySubcategory} assessments={assessments} onChange={(subcategoryId,questionId,value)=>setForm(current=>({...current,answersBySubcategory:{...current.answersBySubcategory,[subcategoryId]:{...current.answersBySubcategory[subcategoryId],[questionId]:value}}}))} />
        <div className="mo-guidance"><strong>Customer-facing details</strong><p>{category.offer}</p></div>
        {previewMode && <div className="mo-list-heading"><h3>{category.name} listings <span className="mo-optional">Optional for now</span></h3><button type="button" className="mo-button mo-button-secondary" onClick={()=>setTop("offers",[...form.offers,newOffer(form.subcategories[0]||"")])}>Add listing</button></div>}
        {previewMode && form.offers.map((offer,index)=><article className="mo-offer" key={offer.id}>
          <div className="mo-offer-title"><h4>Listing {index+1}</h4>{form.offers.length>1&&<button type="button" className="mo-link-button" onClick={()=>setTop("offers",form.offers.filter(x=>x.id!==offer.id))}>Remove</button>}</div>
          <div className="mo-grid">
            <div className="mo-field"><label htmlFor={`offer-sub-${offer.id}`}>Subcategory {setupSession&&<span className="mo-required">*</span>}</label><select id={`offer-sub-${offer.id}`} value={offer.subcategory} onChange={e=>setOffer(offer.id,"subcategory",e.target.value)}><option value="">Select</option>{offer.subcategory&&!form.subcategories.includes(offer.subcategory)&&<option value={offer.subcategory}>Saved inactive activity</option>}{form.subcategories.map(id=><option value={id} key={id}>{category.subcategoryOptions.find(item=>item.id===id)?.name||id}</option>)}</select>{fieldError(`offers.${index}.subcategory`)&&<span className="mo-error">{fieldError(`offers.${index}.subcategory`)}</span>}</div>
            {renderField({id:"listing-name",label:"Listing name",required:true},offer.name,v=>setOffer(offer.id,"name",v),`offers.${index}.name`)}
            {renderField({id:"listing-description",label:"Customer-facing description",required:true},offer.description,v=>setOffer(offer.id,"description",v),`offers.${index}.description`)}
            <div className="mo-field"><label htmlFor={`price-mode-${offer.id}`}>Pricing {setupSession&&<span className="mo-required">*</span>}</label><select id={`price-mode-${offer.id}`} value={offer.priceMode} onChange={e=>setOffer(offer.id,"priceMode",e.target.value)}><option value="fixed">Fixed price in KES</option><option value="quote">Request a quote</option></select></div>
            {offer.priceMode==="fixed"&&renderField({id:"listing-price",label:"Price (KES)",type:"number",required:true},offer.price,v=>setOffer(offer.id,"price",v),`offers.${index}.price`)}
            <div className="mo-field"><label htmlFor={`availability-${offer.id}`}>Availability</label><select id={`availability-${offer.id}`} value={offer.availability} onChange={e=>setOffer(offer.id,"availability",e.target.value)}><option value="in_stock">Available</option><option value="limited">Limited availability</option><option value="preorder">Preorder / scheduled</option><option value="quote">Quote required</option></select></div>
          </div>

          <div className="mo-field"><label htmlFor={`attributes-${offer.id}`}>Variants, customer choices and extra product details</label><textarea id={`attributes-${offer.id}`} rows={3} value={offer.attributes.freeText||""} onChange={e=>setOfferAttribute(offer.id,"freeText",e.target.value)} placeholder={category.offer} /></div>
        </article>)}
      </>}
    </section>;

    if (step === 2) return <section className="mo-panel">
      <div className="mo-panel-heading"><span className="mo-kicker">Setup details</span><h2>Location and coverage</h2><p>Riders, customers, guides or service teams need a clear operating origin and coverage boundary.</p></div>
      <div className="mo-grid">
        {renderField({id:"location-address",label:"Operating street address / premises",required:true},form.location.address,v=>setGroup("location","address",v),"location.address")}
        {renderField({id:"location-town",label:"Town or city",required:true},form.location.town,v=>setGroup("location","town",v),"location.town")}
        <div className="mo-field"><label htmlFor="county">County {setupSession&&<span className="mo-required">*</span>}</label><select id="county" value={form.location.county} onChange={e=>setGroup("location","county",e.target.value)}><option value="">Choose county</option>{KENYA_COUNTIES.map(c=><option key={c}>{c}</option>)}</select>{fieldError("location.county")&&<span className="mo-error">{fieldError("location.county")}</span>}</div>
        {renderField({id:"postal-code",label:"Postal code",help:"Optional"},form.location.postalCode,v=>setGroup("location","postalCode",v),"location.postalCode")}
        {renderField({id:"map-lat",label:"Map latitude",type:"number",help:"Optional map pin"},form.location.mapLat,v=>setGroup("location","mapLat",v),"location.mapLat")}
        {renderField({id:"map-lng",label:"Map longitude",type:"number",help:"Optional map pin"},form.location.mapLng,v=>setGroup("location","mapLng",v),"location.mapLng")}
      </div>
      <div className="mo-field"><label htmlFor="service-areas">Service areas, routes, pickup zones or facilities</label><textarea id="service-areas" rows={3} value={form.location.serviceAreas} onChange={e=>setGroup("location","serviceAreas",e.target.value)} placeholder="List counties, estates, routes, ports, airports or named service areas." /></div>
      {category&&<CheckGroup label="How will customers receive the service or order?" options={fulfillmentOptions} value={form.location.coverageModes} onChange={value=>setGroup("location","coverageModes",value)} error={fieldError("location.coverageModes")} />}
      {packagingVisible&&<div className="mo-guidance mo-packaging"><strong>Rider packaging and handoff</strong><p>Shown because rider delivery is enabled. Configure only what this category and the selected goods need.</p>
        <div className="mo-grid">
          {renderField({id:"pack-method",label:"Packaging method/material",required:true},form.packaging.method,v=>setGroup("packaging","method",v),"packaging.method")}
          {renderField({id:"pack-instructions",label:"Packing and rider handoff instructions",type:"textarea",required:true},form.packaging.instructions,v=>setGroup("packaging","instructions",v),"packaging.instructions")}
        </div>
        <div className="mo-check-grid">
          <label className="mo-check"><input type="checkbox" checked={form.packaging.tamperEvident} onChange={e=>setGroup("packaging","tamperEvident",e.target.checked)}/><span>Tamper-evident seal needed</span></label>
          <label className="mo-check"><input type="checkbox" checked={form.packaging.temperatureAware} onChange={e=>setGroup("packaging","temperatureAware",e.target.checked)}/><span>Temperature-aware packing needed</span></label>
        </div>
      </div>}
      {category?.packaging==="none"&&<div className="mo-note">This business type does not use product packaging by default. If the merchant separately sells goods, model those goods under the relevant product category.</div>}
    </section>;

    if (step === 3) return <section className="mo-panel">
      <div className="mo-panel-heading"><span className="mo-kicker">Setup details</span><h2>How the business works</h2><p>Timing is tailored to the operation: preparation, turnaround, availability, booking or shipment milestones.</p></div>
      {category&&<div className="mo-guidance"><strong>Operational model</strong><p>{category.operations}</p></div>}
      <HoursEditor value={form.operations.hours} onChange={(day,key,value)=>setGroup("operations","hours",{...form.operations.hours,[day]:{...form.operations.hours[day],[key]:value}})} error={fieldError("operations.hours")} errors={errors} />
      {category?.model==="prep"&&<div className="mo-grid">
        {renderField({id:"prep-min",label:"Minimum preparation time (minutes)",type:"number",required:true},form.operations.prepMin,v=>setGroup("operations","prepMin",v),"operations.prepMin")}
        {renderField({id:"prep-max",label:"Maximum preparation time (minutes)",type:"number",required:true},form.operations.prepMax,v=>setGroup("operations","prepMax",v),"operations.prepMax")}
        {renderField({id:"peak-capacity",label:"Orders per time window",type:"number",required:true},form.operations.peakCapacity,v=>setGroup("operations","peakCapacity",v),"operations.peakCapacity")}
      </div>}
      {category?.model==="picker"&&<div className="mo-grid">
        {renderField({id:"picker-minutes",label:"Typical picking lead time (minutes)",type:"number",required:true},form.operations.pickerMinutes,v=>setGroup("operations","pickerMinutes",v),"operations.pickerMinutes")}
        {renderField({id:"slot-capacity",label:"Orders per delivery slot",type:"number",required:true},form.operations.slotCapacity,v=>setGroup("operations","slotCapacity",v),"operations.slotCapacity")}
      </div>}
      {category?.model==="turnaround"&&renderField({id:"turnaround",label:"Standard service turnaround (hours)",type:"number",required:true},form.operations.turnaroundHours,v=>setGroup("operations","turnaroundHours",v),"operations.turnaroundHours")}
      {category?.model==="request"&&renderField({id:"response-sla",label:"Request response SLA (hours)",type:"number",required:true},form.operations.responseSlaHours,v=>setGroup("operations","responseSlaHours",v),"operations.responseSlaHours")}
      {category?.model==="service"&&renderField({id:"service-response",label:"Typical service response time (hours)",type:"number"},form.operations.responseSlaHours,v=>setGroup("operations","responseSlaHours",v),"operations.responseSlaHours")}
      {bookingControlVisible&&<label className="mo-check mo-toggle"><input type="checkbox" checked={form.operations.bookingEnabled} onChange={e=>setGroup("operations","bookingEnabled",e.target.checked)} /><span>Enable booking for the selected subcategory</span></label>}
      {bookingActive&&<div className="mo-subpanel"><h3>Booking details <span className="mo-optional">Optional for now</span></h3><p>Add what you know now, or complete availability and resources after sign-in. Entering these details does not activate bookings.</p>
        <div className="mo-grid">
          {renderField({id:"slot-minutes",label:"Slot/session duration (minutes)",type:"number",required:true},form.operations.booking.slotMinutes,v=>setNested("operations","booking","slotMinutes",v),"operations.booking.slotMinutes")}
          {renderField({id:"horizon-days",label:"Booking horizon (days)",type:"number",required:true},form.operations.booking.horizonDays,v=>setNested("operations","booking","horizonDays",v),"operations.booking.horizonDays")}
          {renderField({id:"capacity-slot",label:"Capacity per slot/unit",type:"number",required:true},form.operations.booking.capacityPerSlot,v=>setNested("operations","booking","capacityPerSlot",v),"operations.booking.capacityPerSlot")}
          {renderField({id:"booking-cutoff",label:"Booking cutoff (hours)",type:"number"},form.operations.booking.cutoffHours,v=>setNested("operations","booking","cutoffHours",v),"operations.booking.cutoffHours")}
          {renderField({id:"booking-cancel",label:"Booking cancellation/reschedule policy",type:"textarea"},form.operations.booking.cancellationPolicy,v=>setNested("operations","booking","cancellationPolicy",v),"operations.booking.cancellationPolicy")}
        </div>
        {category?.id==="vehicle_rentals"&&<div className="mo-grid">
          {renderField({id:"rental-min-days",label:"Minimum rental duration (days)",type:"number",required:true},form.operations.rental.minimumDays,v=>setNested("operations","rental","minimumDays",v),"operations.rental.minimumDays")}
          {renderField({id:"rental-turnaround",label:"Fleet turnaround buffer (hours)",type:"number",required:true},form.operations.rental.turnaroundHours,v=>setNested("operations","rental","turnaroundHours",v),"operations.rental.turnaroundHours")}
          {renderField({id:"rental-checklist",label:"Vehicle handover/return checklist",type:"textarea",required:true},form.operations.rental.handoverChecklist,v=>setNested("operations","rental","handoverChecklist",v),"operations.rental.handoverChecklist")}
        </div>}
      </div>}
      {category?.model==="milestone"&&<div className="mo-subpanel"><h3>Freight and warehouse capacity</h3><div className="mo-grid">
        {renderField({id:"freight-cutoffs",label:"Booking/cargo cutoffs",type:"textarea",required:true},form.operations.freight.cutoffs,v=>setNested("operations","freight","cutoffs",v),"operations.freight.cutoffs")}
        {renderField({id:"freight-capacity",label:"Capacity by lane/date or warehouse unit",type:"textarea",required:true},form.operations.freight.capacity,v=>setNested("operations","freight","capacity",v),"operations.freight.capacity")}
        {renderField({id:"transit-estimate",label:"Estimated transit range by lane",type:"textarea"},form.operations.freight.transitEstimate,v=>setNested("operations","freight","transitEstimate",v),"operations.freight.transitEstimate")}
      </div><label className="mo-check"><input type="checkbox" checked={form.operations.freight.milestonesEnabled} onChange={e=>setNested("operations","freight","milestonesEnabled",e.target.checked)}/><span>Enable shipment/warehouse milestones (received, dispatched, arrived, delivered, discrepancy)</span></label></div>}
      {category?.model==="pharmacy"&&form.subcategories.includes("pharmacy")&&<div className="mo-subpanel"><h3>Prescription and cold-chain operations</h3>
        {renderField({id:"pharmacist-hours",label:"Professional review/dispensing hours",required:true},form.operations.pharmacy.pharmacistReviewHours,v=>setNested("operations","pharmacy","pharmacistReviewHours",v),"operations.pharmacy.pharmacistReviewHours")}
        <label className="mo-check"><input type="checkbox" checked={form.operations.pharmacy.coldChainEnabled} onChange={e=>setNested("operations","pharmacy","coldChainEnabled",e.target.checked)}/><span>Cold-chain delivery is offered. Verification is completed separately.</span></label>
      </div>}
      {!["prep","picker","turnaround","request","service","milestone","pharmacy"].includes(category?.model||"")&&!bookingActive&&<div className="mo-note">No preparation or delivery-time field is required for this setup. Use the operating hours and availability settings above. Stock dispatch timing can be added only if your service needs it.</div>}
      <div className="mo-field"><label htmlFor="ops-notes">Additional cutoff, capacity or exception notes</label><textarea id="ops-notes" rows={3} value={form.operations.additionalNotes} onChange={e=>setGroup("operations","additionalNotes",e.target.value)} placeholder={category?.operations} /></div>
    </section>;

    if (step === 4) return <section className="mo-panel">
      <div className="mo-panel-heading"><span className="mo-kicker">Setup details</span><h2>Documents and compliance</h2><p>Collect core business records, then ask for activity-specific documents only when that branch applies.</p></div>
      <div className="mo-grid">
        {renderField({id:"kra-pin",label:"KRA PIN",required:true,help:"Enter the PIN linked to this merchant."},form.compliance.kraPin,v=>setGroup("compliance","kraPin",v),"compliance.kraPin")}
        <label className="mo-check mo-etims"><input type="checkbox" checked={form.compliance.etimsReady} onChange={e=>setGroup("compliance","etimsReady",e.target.checked)}/><span>Merchant is onboarded to eTIMS, or I have recorded a support action before activation.</span></label>
      </div>
      <div className="mo-upload-grid">
        {CORE_DOCUMENTS.map(doc=>{
          const required=false;
          return <UploadField key={doc.id} id={`upload-${doc.id}`} label={doc.label} required={required} file={files[doc.id]} error={fieldError(`files.${doc.id}`)} onChange={e=>handleFile(doc.id,e)} />;
        })}
      </div>
      {category&&<div className="mo-subpanel"><h3>Category-specific documents</h3><p>Mark a document only if it applies to the merchant's actual activity, then attach it. Your verification team should confirm current requirements and validity.</p>
        <div className="mo-conditional-docs">{category.documents.map((label,index)=>{
          const id=`conditional-${category.id}-${index}`,checked=form.compliance.conditionalChecks.includes(id);
          return <div className="mo-doc-branch" key={id}>
            <label className="mo-check"><input type="checkbox" checked={checked} onChange={e=>setGroup("compliance","conditionalChecks",e.target.checked?[...form.compliance.conditionalChecks,id]:form.compliance.conditionalChecks.filter(x=>x!==id))}/><span>{label}</span></label>
            {checked&&<UploadField id={`upload-${id}`} label="Upload evidence" required={false} file={files[id]} error={fieldError(`files.${id}`)} onChange={e=>handleFile(id,e)} />}
          </div>;
        })}</div>
      </div>}
      <div className="mo-note"><strong>Compliance routing:</strong> selecting a category does not automatically prove a licence applies. The backend/admin review should verify the merchant's role, product/activity, county, premises and current regulator rules.</div>
    </section>;

    return <section className="mo-panel">
      <div className="mo-panel-heading"><span className="mo-kicker">Setup details</span><h2>Payout and policies</h2><p>Add settlement details and applicable customer policies. Entered details still need verification.</p></div>
      <div className="mo-grid">
        <div className="mo-field"><label htmlFor="payout-method">Payout method <span className="mo-optional">Optional for now</span></label><select id="payout-method" value={form.payout.method} onChange={e=>setGroup("payout","method",e.target.value)}><option value="">Choose later</option><option value="mpesa_till">M-Pesa Till / Buy Goods</option><option value="mpesa_paybill">M-Pesa PayBill</option><option value="bank">Bank account</option>{form.payout.method==="mobile_money"&&<option value="mobile_money">Previous mobile number · choose a supported destination</option>}</select></div>
        {form.payout.method==="mpesa_till"&&renderField({id:"payout-till",label:"Till number"},form.payout.tillNumber,v=>setGroup("payout","tillNumber",v),"payout.tillNumber")}
        {form.payout.method==="mpesa_paybill"&&<>
          {renderField({id:"payout-paybill",label:"PayBill / business number"},form.payout.paybillNumber,v=>setGroup("payout","paybillNumber",v),"payout.paybillNumber")}
          {renderField({id:"payout-reference",label:"Account number / reference",help:"Use the reference supplied for this PayBill account. Letters are allowed."},form.payout.accountReference,v=>setGroup("payout","accountReference",v),"payout.accountReference")}
        </>}
        {form.payout.method==="mobile_money"&&<p className="mo-note">Your previous number {form.payout.mobileNumber} is retained. Choose Till, PayBill or bank before saving a payout destination.</p>}
        {form.payout.method==="bank"&&<>
          {renderField({id:"payout-holder",label:"Account holder name"},form.payout.holderName,v=>setGroup("payout","holderName",v),"payout.holderName")}
          {renderField({id:"bank-name",label:"Bank name",required:true},form.payout.bankName,v=>setGroup("payout","bankName",v),"payout.bankName")}
          {previewMode && renderField({id:"bank-branch",label:"Branch"},form.payout.bankBranch,v=>setGroup("payout","bankBranch",v),"payout.bankBranch")}
          {renderField({id:"bank-account",label:"Account number",required:true},form.payout.bankAccount,v=>setGroup("payout","bankAccount",v),"payout.bankAccount")}
        </>}
      </div>
      {previewMode && <div className="mo-grid">
        {renderField({id:"cancellation-policy",label:"Cancellation, refund, returns or claims policy",type:"textarea",required:true},form.policies.cancellation,v=>setGroup("policies","cancellation",v),"policies.cancellation")}
        {renderField({id:"complaint-contact",label:"Customer support / claims contact",required:true},form.policies.complaintContact,v=>setGroup("policies","complaintContact",v),"policies.complaintContact")}
      </div>}
      {previewMode && <><label className="mo-check"><input type="checkbox" checked={form.policies.accurate} onChange={e=>setGroup("policies","accurate",e.target.checked)}/><span>I confirm the business, service, pricing and compliance information is accurate.</span></label>{fieldError("policies.accurate")&&<span className="mo-error">{fieldError("policies.accurate")}</span>}
      <label className="mo-check"><input type="checkbox" checked={form.policies.terms} onChange={e=>setGroup("policies","terms",e.target.checked)}/><span>I accept the merchant platform terms and data processing notice.</span></label>{fieldError("policies.terms")&&<span className="mo-error">{fieldError("policies.terms")}</span>}</>}
      {category&&<div className="mo-review-preview"><h3>Review route</h3><p>{category.review.join(" · ")}</p><h3>After approval</h3><p>{category.after}</p></div>}
      {visibleStatus&&<StatusPanel status={visibleStatus} needsResubmission={savedHome?.review.needsResubmission} onStatusChange={previewMode ? onStatusChange : undefined} />}
      {showReview&&<div className="mo-success" role="status"><strong>Submission confirmed.</strong> Your application status comes from the application service. Submission does not mean approval.</div>}
    </section>;
  }

  if (showHome) return <OnboardingHome form={form} selection={selection} files={files} previewMode={previewMode} embedded={embedded} applicationStatus={visibleStatus} savedHome={savedHome} onExitDemo={onExitDemo}
    onRegistration={()=>{
      setTaskEditing(false);
      setShowHome(false);
      setErrors({});
      setNotice("");
    }}
    onEdit={(index,rowId)=>{
      if(!previewMode && onTaskNavigation?.(index,rowId))return;
      setStep(Number.isInteger(index) && index >= 0 && index < STEPS.length ? index : 0);
      setTaskEditing(true);
      setShowHome(false);
      setErrors({});
      setNotice("");
    }} />;

  if (!taskEditing) return <main className={`merchant-onboarding ${className}`}>
    {previewMode&&onExitDemo&&<button type="button" className="mo-button mo-button-secondary" onClick={onExitDemo}>Exit demo</button>}
    {onDemo&&<button type="button" className="mo-button mo-button-secondary" onClick={()=>{
      const selected = category?.subcategoryOptions.filter(item=>form.subcategories.includes(item.id)) || [];
      if (!category || selected.length === 0) {
        setNotice("Choose a business category and at least one subcategory before opening its tailored demo.");
        document.getElementById("category")?.focus();
        return;
      }
      onDemo({
        categoryId: category.id,
        categoryName: category.name,
        subcategories: selected.map(({ id, name }) => ({ id, name }))
      });
    }}>Try demo · sample data</button>}
    <div className="mo-topline"><div><span className="mo-kicker">Merchant registration · Kenya{previewMode ? " · Preview" : ""}</span><h1>Onboard your business</h1><p>Tell us the essentials. You can finish your operational setup from Home.</p></div><div className="mo-registration-badges"><span className="mo-currency">KES · Kenya</span><span className="mo-page-badge"><span aria-hidden="true" />One page</span></div></div>
    <form noValidate onSubmit={event=>{event.preventDefault();void submit();}}>
      {notice&&<div className={Object.keys(errors).length?"mo-alert":"mo-notice"} role={Object.keys(errors).length?"alert":"status"}>{notice}</div>}
      {renderRegistration()}
      {visibleStatus&&<StatusPanel status={visibleStatus} needsResubmission={savedHome?.review.needsResubmission} onStatusChange={previewMode ? onStatusChange : undefined} />}
      {showReview&&<p className="mo-success" role="status">Your submission was confirmed. This does not mean approval.</p>}
      <div className="mo-actions">
        <div>{onBackToMarketplace&&<button type="button" className="mo-button mo-button-ghost" onClick={onBackToMarketplace}>Exit onboarding</button>}</div>
        <div className="mo-action-right">
          {onSaveDraft && <button type="button" className="mo-button mo-button-secondary" disabled={submitting} onClick={async()=>{
            setSubmitting(true);setNotice("");try{const result=await onSaveDraft(payload(false));setNotice(result?.preview ? "Preview only. Entries remain in this tab and have not been saved to an account." : "Draft saved. You can return after signing in.");}
            catch(error){setNotice(error?.message || "Your draft could not be saved. Your edits are still here.");}finally{setSubmitting(false);}
          }}>Save draft</button>}
          <button type="submit" className="mo-button mo-button-primary" disabled={submitting}>{submitting?"Saving…":previewMode ? "Preview setup Home" : initialHome ? "Save and return Home" : "Submit and open Home"}</button>
        </div>
      </div>
    </form>
    <p className="mo-footnote">{previewMode ? "Demo only. Your details stay in this tab and do not submit an application." : "Your application is saved before Home opens. Admin approval and activation are separate."}</p>
  </main>;

  return <WorkspaceShell previewMode={previewMode} onExitDemo={onExitDemo}
    businessName={form.business.name}
    contextLabel={`${STEPS[step].label} setup`}
    onHome={()=>{setShowHome(true);setTaskEditing(false);setErrors({});setNotice("");}}
    onRegistration={()=>{setShowHome(false);setTaskEditing(false);setErrors({});setNotice("");}}
  ><main className={`merchant-onboarding ${className}`}>
    <div className="mo-topline"><div><span className="mo-kicker">Home setup{previewMode ? " · Preview" : ""}</span><h1>{STEPS[step].label}</h1><p>Add details for this task. Unfinished requirements stay visible on Home.</p></div>
      <button type="button" className="mo-button mo-button-secondary" disabled={submitting} onClick={()=>{if(!previewMode)setForm(savedForm.current);setShowHome(true);setTaskEditing(false);setErrors({});setNotice("");}}>{previewMode ? "Back to Home preview" : "Discard unsaved edits and return Home"}</button>
    </div>
    <form noValidate onSubmit={event=>{event.preventDefault();void submit();}}>
      {notice&&<div className={Object.keys(errors).length?"mo-alert":"mo-notice"} role={Object.keys(errors).length?"alert":"status"}>{notice}</div>}
      <div className="mo-note">{previewMode ? "Your edits stay in this tab." : "Save changes before leaving this task."} Saving details does not verify or activate any service.</div>
      {renderStep()}
      <div className="mo-actions"><div /><button type="submit" className="mo-button mo-button-primary" disabled={submitting}>{submitting ? "Saving…" : previewMode ? "Save and return to Home preview" : "Save and return Home"}</button></div>
    </form>
  </main></WorkspaceShell>;
}

function HoursEditor({ value, onChange, error, errors, required = false }) {
  return <fieldset className="mo-fieldset">
    <legend>Business availability {required&&<span className="mo-required">*</span>}<span className="mo-optional"> Optional for now</span></legend>
    <p className="mo-help">Add known opening hours. A closing time earlier than opening means the following day. Detailed booking and resource availability can be completed from Home.</p>
    <div className="mo-hours">
      {DAYS.map(day=><div className="mo-hours-row" key={day}>
        <label className="mo-check"><input type="checkbox" checked={Boolean(value[day]?.open)} onChange={e=>onChange(day,"open",e.target.checked)}/><span>{day}</span></label>
        {value[day]?.open&&<>
          <label><span className="mo-sr-only">{day} opens at</span><input type="time" value={value[day].from} onChange={e=>onChange(day,"from",e.target.value)}/></label>
          <span className="mo-time-separator">to</span>
          <label><span className="mo-sr-only">{day} closes at</span><input type="time" value={value[day].to} onChange={e=>onChange(day,"to",e.target.value)}/></label>
        </>}
      </div>)}
    </div>
    {error&&<span className="mo-error">{error}</span>}
    {Object.entries(errors).filter(([key])=>key.startsWith("operations.hours.")&&key!=="operations.hours").map(([key,message])=><span className="mo-error" key={key}>{message}</span>)}
  </fieldset>;
}
