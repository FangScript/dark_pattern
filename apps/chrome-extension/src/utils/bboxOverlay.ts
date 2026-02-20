/**
 * Bounding Box Overlay Utilities
 * Draw bounding boxes on screenshots for dark pattern visualization
 */

export interface BboxStyle {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  labelBgColor: string;
  labelTextColor: string;
}

// Severity-based color coding
export const SEVERITY_COLORS: Record<string, BboxStyle> = {
  critical: {
    strokeColor: '#ff0000',
    fillColor: 'rgba(255, 0, 0, 0.15)',
    strokeWidth: 3,
    labelBgColor: '#ff0000',
    labelTextColor: '#ffffff',
  },
  high: {
    strokeColor: '#ff6600',
    fillColor: 'rgba(255, 102, 0, 0.15)',
    strokeWidth: 3,
    labelBgColor: '#ff6600',
    labelTextColor: '#ffffff',
  },
  medium: {
    strokeColor: '#ffcc00',
    fillColor: 'rgba(255, 204, 0, 0.15)',
    strokeWidth: 2,
    labelBgColor: '#ffcc00',
    labelTextColor: '#000000',
  },
  low: {
    strokeColor: '#00cc00',
    fillColor: 'rgba(0, 204, 0, 0.15)',
    strokeWidth: 2,
    labelBgColor: '#00cc00',
    labelTextColor: '#ffffff',
  },
};

export interface BboxAnnotation {
  bbox: [number, number, number, number]; // [x, y, width, height]
  label: string;
  severity: string;
  id?: string;
}

/**
 * Draw bounding boxes on an image and return the annotated image as base64
 */
export async function drawBboxesOnImage(
  imageDataUrl: string,
  annotations: BboxAnnotation[],
  options?: {
    showLabels?: boolean;
    fontSize?: number;
    labelPosition?: 'top' | 'bottom' | 'inside';
  },
): Promise<string> {
  const {
    showLabels = true,
    fontSize = 14,
    labelPosition = 'top',
  } = options || {};

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // Create canvas with same dimensions as image
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // Draw each bounding box
      annotations.forEach((annotation, index) => {
        const [x, y, width, height] = annotation.bbox;
        const style =
          SEVERITY_COLORS[annotation.severity] || SEVERITY_COLORS.medium;

        // Draw filled rectangle
        ctx.fillStyle = style.fillColor;
        ctx.fillRect(x, y, width, height);

        // Draw border
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth;
        ctx.strokeRect(x, y, width, height);

        // Draw label if enabled
        if (showLabels && annotation.label) {
          const labelText = `${index + 1}. ${annotation.label}`;
          ctx.font = `bold ${fontSize}px Arial, sans-serif`;
          const textMetrics = ctx.measureText(labelText);
          const labelPadding = 4;
          const labelHeight = fontSize + labelPadding * 2;
          const labelWidth = textMetrics.width + labelPadding * 2;

          const labelX = x;
          let labelY: number;

          switch (labelPosition) {
            case 'bottom':
              labelY = y + height;
              break;
            case 'inside':
              labelY = y;
              break;
            default:
              labelY = y - labelHeight;
              // Keep label visible if it goes above image
              if (labelY < 0) labelY = y;
              break;
          }

          // Draw label background
          ctx.fillStyle = style.labelBgColor;
          ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

          // Draw label text
          ctx.fillStyle = style.labelTextColor;
          ctx.textBaseline = 'middle';
          ctx.fillText(
            labelText,
            labelX + labelPadding,
            labelY + labelHeight / 2,
          );
        }
      });

      // Return annotated image as base64
      const annotatedDataUrl = canvas.toDataURL('image/png', 0.95);
      resolve(annotatedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for annotation'));
    };

    img.src = imageDataUrl;
  });
}

/**
 * Create a simple legend showing severity colors
 */
export function getSeverityLegendHTML(): string {
  return `
    <div style="display: flex; gap: 16px; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px;">
      <span><span style="display: inline-block; width: 12px; height: 12px; background: #ff0000; margin-right: 4px;"></span>Critical</span>
      <span><span style="display: inline-block; width: 12px; height: 12px; background: #ff6600; margin-right: 4px;"></span>High</span>
      <span><span style="display: inline-block; width: 12px; height: 12px; background: #ffcc00; margin-right: 4px;"></span>Medium</span>
      <span><span style="display: inline-block; width: 12px; height: 12px; background: #00cc00; margin-right: 4px;"></span>Low</span>
    </div>
  `;
}

/**
 * Validate bounding box coordinates against image dimensions
 */
export function validateBbox(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
): {
  valid: boolean;
  adjusted: [number, number, number, number];
  warnings: string[];
} {
  const warnings: string[] = [];
  let [x, y, width, height] = bbox;

  // Clamp x to valid range
  if (x < 0) {
    warnings.push(`x coordinate (${x}) was negative, clamped to 0`);
    x = 0;
  }
  if (x >= imageWidth) {
    warnings.push(`x coordinate (${x}) exceeds image width (${imageWidth})`);
    x = imageWidth - 1;
  }

  // Clamp y to valid range
  if (y < 0) {
    warnings.push(`y coordinate (${y}) was negative, clamped to 0`);
    y = 0;
  }
  if (y >= imageHeight) {
    warnings.push(`y coordinate (${y}) exceeds image height (${imageHeight})`);
    y = imageHeight - 1;
  }

  // Clamp width
  if (width <= 0) {
    warnings.push(`width (${width}) was invalid, set to minimum 10`);
    width = 10;
  }
  if (x + width > imageWidth) {
    const newWidth = imageWidth - x;
    warnings.push(
      `width (${width}) exceeded image bounds, adjusted to ${newWidth}`,
    );
    width = newWidth;
  }

  // Clamp height
  if (height <= 0) {
    warnings.push(`height (${height}) was invalid, set to minimum 10`);
    height = 10;
  }
  if (y + height > imageHeight) {
    const newHeight = imageHeight - y;
    warnings.push(
      `height (${height}) exceeded image bounds, adjusted to ${newHeight}`,
    );
    height = newHeight;
  }

  return {
    valid: warnings.length === 0,
    adjusted: [
      Math.round(x),
      Math.round(y),
      Math.round(width),
      Math.round(height),
    ],
    warnings,
  };
}
