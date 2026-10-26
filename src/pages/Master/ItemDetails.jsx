import { useState, useEffect, useContext, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, ImagePlus, X, ExternalLink, Loader2 } from "lucide-react";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import {
  SPEC_TYPES,
  ITEM_UNITS,
  IMAGE_TYPES,
  fetchItemWithSpecs,
  saveItemDetails,
  uploadItemImage,
  removeItemImages,
  validateImageFile,
  itemErrorMessage,
  isHttpUrl,
} from "../../utils/itemCatalog";

// Master > Items > one item (/master/items/:id, admin only).
// Loads the item and its spec rows in one request and saves everything in
// one RPC (lto_save_item_details). New images are uploaded only on Save.

const SECTION_STYLE = {
  basic: { box: "border-gray-200 bg-gray-50", head: "bg-gray-100 text-gray-800 border-gray-200" },
  lite: { box: "border-brand-200 bg-brand-50/40", head: "bg-brand-50 text-brand-800 border-brand-200" },
  ultra: { box: "border-[#BBF7D0] bg-[#F0FDF4]", head: "bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]" },
};

const emptySeries = () => ({ rate: "", technical_specs: "", remarks: "", img: "", video: "", file: null, preview: "" });

const fromRow = (row) => ({
  ...emptySeries(),
  rate: row?.rate ?? "",
  technical_specs: row?.technical_specs || "",
  remarks: row?.remarks || "",
  img: row?.img || "",
  video: row?.video || "",
});

const toNumberOrNull = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

const inputClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none";
const textareaClass = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none resize-y";

function Field({ id, label, children, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Section({ styleKey, title, children }) {
  const s = SECTION_STYLE[styleKey];
  return (
    <section className={`rounded-lg border ${s.box} overflow-hidden`}>
      <h3 className={`px-4 py-2.5 text-sm font-semibold border-b ${s.head}`}>{title}</h3>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function ImageField({ id, value, preview, onPick, onRemove, onError }) {
  const inputRef = useRef(null);
  const shown = preview || value;
  return (
    <div className="space-y-1.5">
      <span id={`${id}-label`} className="block text-sm font-medium text-foreground">Image</span>
      <div className="flex items-start gap-3">
        {shown ? (
          <div className="relative">
            <a href={value || undefined} target="_blank" rel="noreferrer" className="block">
              <img src={shown} alt="" className="h-24 w-24 rounded-md border bg-white object-contain" />
            </a>
            <button
              type="button"
              onClick={onRemove}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-destructive shadow-sm hover:bg-destructive/10"
              aria-label="Remove image"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed bg-card text-xs text-muted-foreground">
            No image
          </div>
        )}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-accent"
            aria-describedby={`${id}-label`}
          >
            <ImagePlus size={16} aria-hidden="true" />
            {shown ? "Replace" : "Upload"}
          </button>
          <span className="text-xs text-muted-foreground">JPG, PNG or WebP, max 5 MB. Compressed before upload.</span>
        </div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const problem = validateImageFile(file);
            if (problem) onError(problem);
            else onPick(file);
          }}
        />
      </div>
    </div>
  );
}

export default function ItemDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showNotification, currentUser } = useContext(AuthContext) || {};
  const { askConfirm, confirmDialog } = useConfirmDialog();

  const [status, setStatus] = useState("loading"); // loading | ready | missing | error
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [meta, setMeta] = useState({ updated_at: null, updated_by: null });
  const [basic, setBasic] = useState({ item_name: "", item_code: "", unit: "", rate: "", reseller_rate: "", technical_specs: "" });
  const [series, setSeries] = useState({ lite: emptySeries(), ultra: emptySeries() });
  const savedImages = useRef({ lite: "", ultra: "" }); // image URLs currently stored in the DB

  const load = async () => {
    setStatus("loading");
    try {
      const result = await fetchItemWithSpecs(id);
      if (!result) { setStatus("missing"); return; }
      const { item, specs } = result;
      const b = specs[SPEC_TYPES.basic];
      setBasic({
        item_name: item.item_name || "",
        item_code: item.item_code || "",
        unit: item.unit || "",
        rate: b?.rate ?? "",
        reseller_rate: b?.reseller_rate ?? "",
        technical_specs: b?.technical_specs || "",
      });
      const lite = fromRow(specs[SPEC_TYPES.lite]);
      const ultra = fromRow(specs[SPEC_TYPES.ultra]);
      setSeries({ lite, ultra });
      savedImages.current = { lite: lite.img, ultra: ultra.img };
      setMeta({ updated_at: item.updated_at, updated_by: item.updated_by });
      setDirty(false);
      setStatus("ready");
    } catch (err) {
      console.error("Error loading item:", err);
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Release object URLs used for local image previews.
  useEffect(() => () => {
    Object.values(series).forEach((s) => s.preview && URL.revokeObjectURL(s.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setBasicField = (field, value) => {
    setBasic((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const setSeriesField = (key, field, value) => {
    setSeries((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    setDirty(true);
  };

  const pickImage = (key, file) => {
    setSeries((prev) => {
      if (prev[key].preview) URL.revokeObjectURL(prev[key].preview);
      return { ...prev, [key]: { ...prev[key], file, preview: URL.createObjectURL(file) } };
    });
    setDirty(true);
  };

  const removeImage = (key) => {
    setSeries((prev) => {
      if (prev[key].preview) URL.revokeObjectURL(prev[key].preview);
      return { ...prev, [key]: { ...prev[key], file: null, preview: "", img: "" } };
    });
    setDirty(true);
  };

  const goBack = () => {
    if (!dirty) { navigate("/master/items"); return; }
    askConfirm(
      { title: "Discard changes?", message: "You have unsaved changes on this item.", confirmText: "Discard" },
      () => navigate("/master/items")
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = basic.item_name.trim();
    const code = basic.item_code.trim();
    if (!name || !code) {
      showNotification?.("Item Name and Item Code are required", "error");
      return;
    }
    const badVideo = ["lite", "ultra"].find((k) => series[k].video.trim() && !isHttpUrl(series[k].video));
    if (badVideo) {
      showNotification?.(`${badVideo === "lite" ? "Lite" : "UT"} Series video must be a full link starting with http(s)://`, "error");
      return;
    }

    setSaving(true);
    const updatedBy = currentUser?.fullName || currentUser?.username || null;
    const uploaded = [];
    try {
      // Upload new images first (in parallel); the RPC then stores their URLs.
      const imageUrls = {};
      await Promise.all(
        ["lite", "ultra"].map(async (key) => {
          const s = series[key];
          if (s.file) {
            imageUrls[key] = await uploadItemImage(id, SPEC_TYPES[key], s.file);
            uploaded.push(imageUrls[key]);
          } else {
            imageUrls[key] = s.img;
          }
        })
      );

      const seriesPayload = (key) => ({
        type: SPEC_TYPES[key],
        rate: toNumberOrNull(series[key].rate),
        technical_specs: series[key].technical_specs,
        remarks: series[key].remarks,
        img: imageUrls[key] || null,
        video: series[key].video.trim() || null,
      });

      await saveItemDetails({
        uuid: id,
        name,
        code,
        unit: basic.unit,
        updatedBy,
        specs: [
          {
            type: SPEC_TYPES.basic,
            rate: toNumberOrNull(basic.rate),
            reseller_rate: toNumberOrNull(basic.reseller_rate),
            technical_specs: basic.technical_specs,
          },
          seriesPayload("lite"),
          seriesPayload("ultra"),
        ],
      });

      // Saved: old images that were replaced or removed can go.
      const stale = ["lite", "ultra"]
        .map((key) => savedImages.current[key])
        .filter((url) => url && !Object.values(imageUrls).includes(url));
      removeItemImages(stale);

      showNotification?.("Item saved", "success");
      await load();
    } catch (err) {
      console.error("Error saving item:", err);
      removeItemImages(uploaded); // don't leave orphaned uploads behind
      showNotification?.("Failed to save item: " + itemErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading item...
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>{status === "missing" ? "This item doesn't exist (it may have been deleted)." : "Couldn't load this item."}</p>
        <div className="flex gap-2">
          {status === "error" && (
            <button type="button" onClick={load} className="h-9 rounded-md border border-input bg-card px-3 font-medium hover:bg-accent">
              Try again
            </button>
          )}
          <button type="button" onClick={() => navigate("/master/items")} className="h-9 rounded-md bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/90">
            Back to Items
          </button>
        </div>
      </div>
    );
  }

  const seriesSection = (key, title) => (
    <Section styleKey={key} title={title}>
      <Field id={`${key}-rate`} label="Rate (₹)">
        <input
          id={`${key}-rate`}
          type="number"
          min="0"
          step="0.01"
          value={series[key].rate}
          onChange={(e) => setSeriesField(key, "rate", e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field id={`${key}-video`} label="Video link">
        <div className="flex gap-2">
          <input
            id={`${key}-video`}
            type="url"
            placeholder="https://..."
            value={series[key].video}
            onChange={(e) => setSeriesField(key, "video", e.target.value)}
            className={inputClass}
          />
          {isHttpUrl(series[key].video) && (
            <a
              href={series[key].video.trim()}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-card text-primary hover:bg-accent"
              aria-label="Open video link"
              title="Open video link"
            >
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
        </div>
      </Field>
      <Field id={`${key}-specs`} label="Technical Specs" className="md:col-span-2">
        <textarea
          id={`${key}-specs`}
          rows={4}
          value={series[key].technical_specs}
          onChange={(e) => setSeriesField(key, "technical_specs", e.target.value)}
          className={textareaClass}
        />
      </Field>
      <Field id={`${key}-remarks`} label="Remarks">
        <textarea
          id={`${key}-remarks`}
          rows={3}
          value={series[key].remarks}
          onChange={(e) => setSeriesField(key, "remarks", e.target.value)}
          className={textareaClass}
        />
      </Field>
      <ImageField
        id={`${key}-image`}
        value={series[key].img}
        preview={series[key].preview}
        onPick={(file) => pickImage(key, file)}
        onRemove={() => removeImage(key)}
        onError={(msg) => showNotification?.(msg, "error")}
      />
    </Section>
  );

  return (
    <form onSubmit={handleSave} className="flex flex-1 flex-col min-h-0 gap-4 animate-in fade-in slide-in-from-right-4 duration-200">
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={goBack}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Back to Items"
          title="Back to Items"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground break-words">{basic.item_name || "Item"}</h2>
          {meta.updated_at && (
            <p className="text-xs text-muted-foreground">
              Last updated {new Date(meta.updated_at).toLocaleString("en-IN")}
              {meta.updated_by ? ` by ${meta.updated_by}` : ""}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={saving || !dirty}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto pb-4">
        <Section styleKey="basic" title="Basic Details">
          <Field id="basic-name" label="Item Name *" className="md:col-span-2">
            <input id="basic-name" required value={basic.item_name} onChange={(e) => setBasicField("item_name", e.target.value)} className={inputClass} />
          </Field>
          <Field id="basic-code" label="Item Code *">
            <input id="basic-code" required value={basic.item_code} onChange={(e) => setBasicField("item_code", e.target.value)} className={inputClass} />
          </Field>
          <Field id="basic-unit" label="Unit">
            <select id="basic-unit" value={basic.unit} onChange={(e) => setBasicField("unit", e.target.value)} className={inputClass}>
              <option value="">Select unit</option>
              {(basic.unit && !ITEM_UNITS.includes(basic.unit) ? [basic.unit, ...ITEM_UNITS] : ITEM_UNITS).map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field id="basic-rate" label="Rate (₹)">
            <input id="basic-rate" type="number" min="0" step="0.01" value={basic.rate} onChange={(e) => setBasicField("rate", e.target.value)} className={inputClass} />
          </Field>
          <Field id="basic-reseller" label="Reseller Rate (₹)">
            <input id="basic-reseller" type="number" min="0" step="0.01" value={basic.reseller_rate} onChange={(e) => setBasicField("reseller_rate", e.target.value)} className={inputClass} />
          </Field>
          <Field id="basic-specs" label="Technical Specs" className="md:col-span-2">
            <textarea id="basic-specs" rows={3} value={basic.technical_specs} onChange={(e) => setBasicField("technical_specs", e.target.value)} className={textareaClass} />
          </Field>
        </Section>

        {seriesSection("lite", "Lite Series")}
        {seriesSection("ultra", "UT Series")}
      </div>
      {confirmDialog}
    </form>
  );
}
