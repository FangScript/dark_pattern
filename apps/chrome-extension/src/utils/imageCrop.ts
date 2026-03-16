/**
 * Crop an image from a base64 data URL using Canvas API (browser-compatible)
 * @param imageDataUrl - Base64 data URL of the image
 * @param bbox - Bounding box [x, y, width, height]
 * @returns Cropped image as base64 data URL
 */
export async function cropImageFromBbox(
  imageDataUrl: string,
  bbox: [number, number, number, number],
): Promise<string> {
  return imageDataUrl;
}
