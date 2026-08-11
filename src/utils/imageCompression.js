// Client-side image compression before upload to Supabase Storage. No new
// dependency needed -- resize + re-encode via the native Canvas API. Applies
// only to image/* files; anything else (PDF, doc, video) passes through
// unchanged, since those need real codec-level compression this can't do.

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.8;
// Below this size, re-encoding rarely helps and just costs a canvas round-trip.
const SKIP_IF_UNDER_BYTES = 300 * 1024;

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Resizes to at most maxDimension on the longest side and re-encodes as JPEG
// at `quality`. Returns the original file untouched if it's not an image,
// already small, or if compression didn't actually shrink it.
export async function compressImageFile(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }
  if (file.size <= SKIP_IF_UNDER_BYTES) {
    return file;
  }

  try {
    const dataUrl = await readFileAsDataURL(file);
    const img = await loadImage(dataUrl);

    const { width, height } = img;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.getContext("2d").drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) {
      return file;
    }

    const newName = file.name.replace(/\.[^./]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    console.error("Image compression failed, using original file:", err);
    return file;
  }
}

// Returns an error message string if the file exceeds maxSizeMB, else null.
export function validateFileSize(file, maxSizeMB) {
  if (!file) return null;
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return `File size must be less than ${maxSizeMB}MB (selected file is ${(file.size / (1024 * 1024)).toFixed(1)}MB)`;
  }
  return null;
}
