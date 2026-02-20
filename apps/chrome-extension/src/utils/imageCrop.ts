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
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const [x, y, width, height] = bbox;

      // Create canvas for cropping
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Draw the cropped portion
      ctx.drawImage(
        img,
        x,
        y,
        width,
        height, // Source rectangle
        0,
        0,
        width,
        height, // Destination rectangle
      );

      // Convert to base64
      const croppedDataUrl = canvas.toDataURL('image/png', 0.95);
      resolve(croppedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = imageDataUrl;
  });
}
