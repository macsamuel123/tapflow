export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_EDGE = 800;
const QUALITY = 0.8;

export function photoFileError(file: Pick<File, "type" | "size">): string | null {
  if (!TYPES.includes(file.type)) return "Use a JPG, PNG or WebP photo.";
  return file.size > MAX_PHOTO_BYTES ? "That photo is over the 5 MB limit." : null;
}

/** Resizes and compresses in the browser. Always JPEG, because Safari can't export WebP. */
export async function preparePhoto(file: File, maxEdge = MAX_EDGE): Promise<Blob> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.fillStyle = "#fff"; // JPEG has no transparency
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))), "image/jpeg", QUALITY);
  });
}

/** What a stored photo may weigh after resizing: the cloud bucket's limit. */
export const MAX_STORED_BYTES = 500 * 1024;
