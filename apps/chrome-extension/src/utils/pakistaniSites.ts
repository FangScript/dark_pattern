// Pakistani e-commerce site detection and utilities

export const PAKISTANI_ECOMMERCE_SITES = [
  'daraz.pk',
  'yayvo.com',
  'telemart.pk',
  'homeshopping.pk',
  'shophive.com',
  'ishopping.pk',
  'clickmall.pk',
  'symbios.pk',
  'olx.com.pk',
  'pakwheels.com',
  'goto.com.pk',
  'priceoye.pk',
  'mega.pk',
  'qistpay.com',
  'cartloot.com',
  'ezmall.pk',
  'shopistan.pk',
];

export function isPakistaniEcommerceSite(url: string): boolean {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  return PAKISTANI_ECOMMERCE_SITES.some((site) => urlLower.includes(site));
}

export function getSiteName(url: string): string | null {
  if (!url) return null;
  const urlLower = url.toLowerCase();
  const site = PAKISTANI_ECOMMERCE_SITES.find((site) =>
    urlLower.includes(site),
  );
  return site || null;
}

export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url || !url.trim()) {
    return { valid: false, error: 'URL is required' };
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { valid: false, error: 'URL must start with http:// or https://' };
  }

  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
