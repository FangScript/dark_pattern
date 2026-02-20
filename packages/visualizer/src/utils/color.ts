import type { ThemeConfig } from 'antd';

// Phoenix theme palette — fire red, amber, gold
// Derived from the phoenix shield logo
const elementColor = ['#C23616']; // deep phoenix red
const highlightColorForSearchArea = '#E84118'; // vibrant fire red
const highlightColorForElement = '#E58E26'; // phoenix gold

function djb2Hash(str?: string): number {
  if (!str) {
    str = 'unnamed';
  }
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i); // hash * 33 + c
  }
  return hash >>> 0; // Convert to unsigned 32
}

export function colorForName(name: string): string {
  const hashNumber = djb2Hash(name);
  return elementColor[hashNumber % elementColor.length];
}

export function highlightColorForType(type: 'searchArea' | 'element'): string {
  if (type === 'searchArea') {
    return highlightColorForSearchArea;
  }
  return highlightColorForElement;
}

export function globalThemeConfig(): ThemeConfig {
  return {
    token: {
      colorPrimary: '#C23616',     // Phoenix fire red
      colorInfo: '#E84118',         // Vibrant red for info
      colorSuccess: '#44bd32',      // Keep green for success
      colorWarning: '#E58E26',      // Phoenix amber/gold
      colorError: '#e74c3c',        // Error red
      borderRadius: 8,
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    components: {
      Layout: {
        headerHeight: 60,
        headerPadding: '0 30px',
        headerBg: '#1a1a2e',        // Dark navy background
        bodyBg: '#FFF',
      },
      Button: {
        colorPrimary: '#C23616',
        algorithm: true,
      },
      Menu: {
        colorPrimary: '#C23616',
      },
    },
  };
}
