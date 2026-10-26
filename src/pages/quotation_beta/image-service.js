// Item photos for the beta quotation. The sheet holds a link per series; the
// image is downloaded in the browser and shrunk hard (small JPEG data URL) so
// the form, the preview and the generated PDF stay light. The original link is
// always kept: clicking a thumbnail opens it in a new tab.
import { useEffect, useState } from "react";

const MAX_SIDE = 160; // px, longest side of the stored thumbnail
const JPEG_QUALITY = 0.5;

export const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

// Candidate image URLs for a pasted link. Google Drive "share" links are page
// URLs, not images, so they are rewritten to Drive's thumbnail endpoints.
export const imageCandidates = (link) => {
  const url = String(link || "").trim();
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]+)/i);
  if (drive) {
    const id = drive[1];
    return [
      `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
      `https://lh3.googleusercontent.com/d/${id}=w400`,
    ];
  }
  return [url];
};

const cache = new Map(); // link -> Promise<{ dataUrl, width, height } | null>

const shrink = async (blob) => {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // JPEG has no alpha: flatten transparent PNGs onto white
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();
  return { dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), width, height };
};

// Resolves to the compressed image, or null when the link can't be read from
// the browser (blocked by CORS, not an image, offline...). Cached per link.
export const getCompressedImage = (link) => {
  const key = String(link || "").trim();
  if (!isHttpUrl(key)) return Promise.resolve(null);
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        for (const candidate of imageCandidates(key)) {
          try {
            const res = await fetch(candidate, { mode: "cors" });
            if (!res.ok) continue;
            const blob = await res.blob();
            if (!blob.type.startsWith("image/")) continue;
            return await shrink(blob);
          } catch {
            /* try the next candidate */
          }
        }
        return null;
      })()
    );
  }
  return cache.get(key);
};

// Compress every distinct link first (PDF generation needs the data URLs
// before rendering). Returns { [link]: { dataUrl, width, height } } for the ones that worked.
export const prepareImages = async (links) => {
  const distinct = [...new Set((links || []).map((l) => String(l || "").trim()).filter(isHttpUrl))];
  const results = await Promise.all(distinct.map(async (l) => [l, await getCompressedImage(l)]));
  return Object.fromEntries(results.filter(([, img]) => img));
};

// { status: "idle" | "loading" | "ready" | "failed", image }
export function useCompressedImage(link) {
  const [state, setState] = useState({ link: "", status: "idle", image: null });
  const key = String(link || "").trim();

  useEffect(() => {
    if (!isHttpUrl(key)) return undefined;
    let cancelled = false;
    getCompressedImage(key).then((image) => {
      if (!cancelled) setState({ link: key, status: image ? "ready" : "failed", image });
    });
    return () => { cancelled = true; };
  }, [key]);

  if (!isHttpUrl(key)) return { status: "idle", image: null };
  if (state.link !== key) return { status: "loading", image: null };
  return { status: state.status, image: state.image };
}
