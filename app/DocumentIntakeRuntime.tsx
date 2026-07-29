"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type SuggestedField = {
  value: string;
  confidence: number;
  source: string;
};

type SuggestedPayments = {
  values: string[];
  confidence: number;
  source: string;
};

type IntakeAnalysis = {
  fields: {
    businessName: SuggestedField;
    cuisine: SuggestedField;
    contactName: SuggestedField;
    phone: SuggestedField;
    email: SuggestedField;
    insuranceExpiry: SuggestedField;
    licenseExpiry: SuggestedField;
    paymentTypes: SuggestedPayments;
    notes: SuggestedField;
  };
  documents: Array<{
    fileName: string;
    type: string;
    summary: string;
  }>;
  warnings: string[];
  analyzedFiles: number;
  totalFiles: number;
  filesStored: boolean;
};

const FIELD_LABELS: Array<[keyof Omit<IntakeAnalysis["fields"], "paymentTypes">, string]> = [
  ["businessName", "Business Name"],
  ["cuisine", "Cuisine"],
  ["contactName", "Contact"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["insuranceExpiry", "Insurance Expiration"],
  ["licenseExpiry", "Food License Expiration"],
  ["notes", "Operations Notes"],
];

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.classList.add("ai-intake-filled");
}

function setNativeChecked(element: HTMLInputElement, checked: boolean) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  if (setter) setter.call(element, checked);
  else element.checked = checked;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  if (checked) element.closest("label")?.classList.add("ai-intake-filled-choice");
}

function responseError(response: Response) {
  return response.json()
    .then((value: { error?: string }) => value.error || "The documents could not be analyzed.")
    .catch(() => "The documents could not be analyzed.");
}

function fieldConfidence(value: number) {
  if (value >= 0.85) return "High";
  if (value >= 0.6) return "Medium";
  if (value > 0) return "Low";
  return "Unknown";
}

function documentType(value: string) {
  const labels: Record<string, string> = {
    coi: "Certificate of Insurance",
    food_license: "Food License",
    vendor_application: "Vendor Application",
    menu: "Menu",
    w9: "W-9",
    other: "Other Document",
  };
  return labels[value] || "Other Document";
}

function words(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
}

function bestCuisineOption(select: HTMLSelectElement, suggestion: string) {
  const candidates = Array.from(select.options).filter((option) => option.value && option.value !== "custom");
  const exact = candidates.find((option) => option.value.toLowerCase() === suggestion.toLowerCase());
  if (exact) return exact.value;
  const suggestedWords = new Set(words(suggestion));
  const scored = candidates.map((option) => ({
    value: option.value,
    score: words(option.value).filter((word) => suggestedWords.has(word)).length,
  })).sort((left, right) => right.score - left.score);
  return scored[0]?.score ? scored[0].value : "custom";
}

function locateTruckForm() {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form.form-grid")).find((form) => (
    Boolean(form.querySelector('input[name="name"]'))
      && Boolean(form.querySelector('input[name="insuranceExpiry"]'))
      && Boolean(form.querySelector('select option[value="custom"]'))
  )) || null;
}

function fillInput(form: HTMLFormElement, selector: string, value: string, replaceExisting: boolean) {
  if (!value) return false;
  const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!input || (!replaceExisting && input.value.trim())) return false;
  setNativeValue(input, value);
  return true;
}

function applySuggestions(form: HTMLFormElement, analysis: IntakeAnalysis, replaceExisting: boolean) {
  let filled = 0;
  const fields = analysis.fields;
  if (fillInput(form, 'input[name="name"]', fields.businessName.value, replaceExisting)) filled += 1;
  if (fillInput(form, 'input[name="contact"]', fields.contactName.value, replaceExisting)) filled += 1;
  if (fillInput(form, 'input[name="phone"]', fields.phone.value, replaceExisting)) filled += 1;
  if (fillInput(form, 'input[name="email"]', fields.email.value, replaceExisting)) filled += 1;
  if (fillInput(form, 'input[name="insuranceExpiry"]', fields.insuranceExpiry.value, replaceExisting)) filled += 1;
  if (fillInput(form, 'input[name="licenseExpiry"]', fields.licenseExpiry.value, replaceExisting)) filled += 1;
  if (fillInput(form, 'textarea[name="notes"]', fields.notes.value, replaceExisting)) filled += 1;

  if (fields.cuisine.value) {
    const select = form.querySelector<HTMLSelectElement>('select option[value="custom"]')?.parentElement as HTMLSelectElement | null;
    if (select && (replaceExisting || !select.value)) {
      const selectedValue = bestCuisineOption(select, fields.cuisine.value);
      setNativeValue(select, selectedValue);
      filled += 1;
      if (selectedValue === "custom") {
        window.setTimeout(() => {
          const custom = form.querySelector<HTMLInputElement>('input[aria-label="Custom cuisine"]');
          if (custom) setNativeValue(custom, fields.cuisine.value);
        }, 0);
      }
    }
  }

  if (fields.paymentTypes.values.length) {
    const selected = new Set(fields.paymentTypes.values.map((value) => value.toLowerCase()));
    const checkboxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="paymentMethods"][type="checkbox"]'));
    const knownValues = new Set(checkboxes.map((checkbox) => checkbox.value.toLowerCase()));
    for (const checkbox of checkboxes) {
      if (replaceExisting || !checkbox.checked) {
        const shouldCheck = selected.has(checkbox.value.toLowerCase());
        if (shouldCheck) {
          setNativeChecked(checkbox, true);
          filled += 1;
        }
      }
    }
    const customPayments = fields.paymentTypes.values.filter((value) => !knownValues.has(value.toLowerCase()));
    if (customPayments.length) {
      const custom = form.querySelector<HTMLInputElement>('input[name="paymentMethods"][type="text"]');
      if (custom && (replaceExisting || !custom.value.trim())) {
        setNativeValue(custom, customPayments.join(", "));
        filled += 1;
      }
    }
  }

  return filled;
}

export default function DocumentIntakeRuntime() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [truckForm, setTruckForm] = useState<HTMLFormElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<IntakeAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);

  useEffect(() => {
    let active = true;
    const timers = new Set<number>();
    let polls = 0;

    function sync() {
      if (!active) return;
      const form = locateTruckForm();
      if (!form) {
        setPortalTarget(null);
        setTruckForm(null);
        return;
      }
      let host = form.querySelector<HTMLElement>("[data-document-intake-root]");
      if (!host) {
        host = document.createElement("div");
        host.dataset.documentIntakeRoot = "true";
        const logo = form.querySelector(".truck-logo-upload");
        if (logo) form.insertBefore(host, logo);
        else form.prepend(host);
      }
      setPortalTarget(host);
      setTruckForm(form);
    }

    function schedule(delay: number) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        sync();
      }, delay);
      timers.add(timer);
    }

    function interaction() {
      schedule(0);
      schedule(120);
      schedule(500);
    }

    const initial = window.setInterval(() => {
      polls += 1;
      sync();
      if (polls >= 20) window.clearInterval(initial);
    }, 350);

    sync();
    document.addEventListener("click", interaction, { passive: true });
    document.addEventListener("focusin", interaction, { passive: true });
    return () => {
      active = false;
      window.clearInterval(initial);
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("click", interaction);
      document.removeEventListener("focusin", interaction);
    };
  }, []);

  useEffect(() => {
    if (!portalTarget) {
      setFiles([]);
      setAnalysis(null);
      setError("");
      setMessage("");
      setReplaceExisting(false);
    }
  }, [portalTarget]);

  const visibleSuggestions = useMemo(() => {
    if (!analysis) return [];
    const values = FIELD_LABELS.flatMap(([key, label]) => {
      const field = analysis.fields[key];
      return field.value ? [{ key, label, value: field.value, confidence: field.confidence, source: field.source }] : [];
    });
    if (analysis.fields.paymentTypes.values.length) {
      values.push({
        key: "paymentTypes" as keyof Omit<IntakeAnalysis["fields"], "paymentTypes">,
        label: "Payment Types",
        value: analysis.fields.paymentTypes.values.join(", "),
        confidence: analysis.fields.paymentTypes.confidence,
        source: analysis.fields.paymentTypes.source,
      });
    }
    return values;
  }, [analysis]);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || !truckForm) return;
    setBusy(true);
    setError("");
    setMessage("");
    setAnalysis(null);
    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      const response = await fetch("/api/intake-analysis", { method: "POST", body });
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json() as IntakeAnalysis;
      setAnalysis(result);
      const count = applySuggestions(truckForm, result, replaceExisting);
      setMessage(count
        ? `${count} intake ${count === 1 ? "field was" : "fields were"} filled. Review every suggestion before creating the truck.`
        : "The documents were analyzed, but no empty intake fields could be filled.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The documents could not be analyzed.");
    } finally {
      setBusy(false);
    }
  }

  function applyAgain() {
    if (!truckForm || !analysis) return;
    const count = applySuggestions(truckForm, analysis, replaceExisting);
    setMessage(count
      ? `${count} ${count === 1 ? "field was" : "fields were"} applied.`
      : "No additional fields were changed.");
  }

  if (!portalTarget || !truckForm) return null;

  return createPortal(<>
    <style>{`
      .document-intake{grid-column:1/-1;margin:0 0 4px;padding:15px;border:1px solid #3a5d78;border-radius:10px;background:linear-gradient(135deg,#0a223b,#0c2a45);color:#dcecff}
      .document-intake-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:12px}
      .document-intake-head h3{margin:0 0 4px;font-size:15px}
      .document-intake-head p{margin:0;color:#9eb4c8;font-size:10px;line-height:1.5}
      .document-intake-badge{padding:4px 7px;border:1px solid #6b9345;border-radius:10px;color:#cfff9e;background:#16321b;font-size:9px;font-weight:900;white-space:nowrap}
      .document-intake form{display:grid;gap:10px}
      .document-drop{display:grid;gap:5px;padding:13px;border:1px dashed #54748e;border-radius:8px;background:#071a2f;cursor:pointer}
      .document-drop strong{font-size:11px}.document-drop span{color:#8fa8bd;font-size:9px}.document-drop input{width:100%;color:#bcd0e1;font-size:10px}
      .document-file-list{display:flex;gap:6px;flex-wrap:wrap}
      .document-file-list span{max-width:100%;padding:4px 7px;border:1px solid #395b75;border-radius:8px;background:#0a1e33;color:#b9d0e2;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .document-intake-controls{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      .document-intake-controls label{margin-right:auto;display:flex;gap:7px;align-items:center;color:#9cb3c7;font-size:9px}
      .document-intake-status{margin-top:10px;padding:9px;border-radius:7px;font-size:10px;line-height:1.45}
      .document-intake-status.good{border:1px solid #527d38;background:#142d18;color:#cfffaf}.document-intake-status.bad{border:1px solid #8b3935;background:#3a1719;color:#ffb1aa}
      .document-analysis{display:grid;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #31516c}
      .document-analysis h4{margin:0;font-size:12px}.document-analysis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .document-suggestion{padding:8px;border:1px solid #31516c;border-radius:7px;background:#081c31}.document-suggestion strong{display:block;color:#a9c2d7;font-size:9px}.document-suggestion p{margin:4px 0;color:#e1effa;font-size:10px;overflow-wrap:anywhere}.document-suggestion small{color:#7f9ab1;font-size:8px}
      .document-detected{display:grid;gap:6px}.document-detected article{padding:8px;border-left:3px solid #6c9943;background:#081b2e}.document-detected strong{display:block;font-size:9px}.document-detected p{margin:3px 0 0;color:#94adbf;font-size:9px;line-height:1.4}
      .document-warning{margin:0;padding-left:18px;color:#ffc58b;font-size:9px;line-height:1.5}
      .document-privacy{margin:2px 0 0;color:#819caf;font-size:8px;line-height:1.45}
      .ai-intake-filled{outline:2px solid #75ad3c!important;outline-offset:1px}.ai-intake-filled-choice{border-radius:5px;outline:1px solid #75ad3c;outline-offset:2px}
      @media(max-width:700px){.document-analysis-grid{grid-template-columns:1fr}.document-intake-controls{align-items:stretch;flex-direction:column}.document-intake-controls label{margin:0}.document-intake-controls button{width:100%}}
    `}</style>
    <section className="document-intake" aria-label="AI Document Intake">
      <div className="document-intake-head">
        <div><h3>AI Document Intake</h3><p>Upload vendor documents to prefill the truck profile. You remain responsible for reviewing every field.</p></div>
        <span className="document-intake-badge">AI ASSISTED</span>
      </div>
      <form onSubmit={analyze}>
        <label className="document-drop">
          <strong>Choose Documents</strong>
          <span>PDF, JPG, PNG, WebP, or Word • Up to 6 files • 10 MB each</span>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              setFiles(Array.from(event.target.files || []).slice(0, 6));
              setAnalysis(null);
              setError("");
              setMessage("");
            }}
          />
        </label>
        {files.length > 0 && <div className="document-file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}
        <div className="document-intake-controls">
          <label><input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /> Replace fields I already entered</label>
          {analysis && <button className="secondary" type="button" disabled={busy} onClick={applyAgain}>Apply Suggestions</button>}
          <button className="primary" type="submit" disabled={busy || !files.length}>{busy ? "Reading and Analyzing…" : "Analyze and Fill Form"}</button>
        </div>
      </form>
      {message && <div className="document-intake-status good" role="status">✓ {message}</div>}
      {error && <div className="document-intake-status bad" role="alert">△ {error}</div>}
      {analysis && <div className="document-analysis">
        <h4>Suggested Intake Information</h4>
        {visibleSuggestions.length > 0
          ? <div className="document-analysis-grid">{visibleSuggestions.map((field) => <article className="document-suggestion" key={String(field.key)}><strong>{field.label} • {fieldConfidence(field.confidence)} Confidence</strong><p>{field.value}</p><small>{field.source || "Source not identified"}</small></article>)}</div>
          : <div className="document-intake-status bad">No reliable intake fields were found. Try a clearer scan or another document.</div>}
        {analysis.documents.length > 0 && <div className="document-detected">{analysis.documents.map((document, index) => <article key={`${document.fileName}-${index}`}><strong>{documentType(document.type)} • {document.fileName}</strong><p>{document.summary}</p></article>)}</div>}
        {analysis.warnings.length > 0 && <ul className="document-warning">{analysis.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>}
        <p className="document-privacy">The uploaded files are analyzed temporarily to fill this form and are not stored with the truck profile. Sensitive tax, banking, government-ID, and policy-number data is excluded from the AI result.</p>
      </div>}
    </section>
  </>, portalTarget);
}
