import { log } from 'dastro/client';

/** Browsers discard custom cursors larger than this. */
const MAX_CURSOR_PX = 128;
/** Used when an SVG has neither width/height nor a viewBox. */
const DEFAULT_CURSOR_PX = 32;

/**
 * CSS cannot scale `cursor: url(...)`. The image is shown at its intrinsic
 * size, and the hotspot is a pixel offset from the top-left. This rewrites the
 * icon to the requested scale and always pins the hotspot to the centre.
 */
export async function applyRotateCursor($el: HTMLElement): Promise<void> {
  const url = $el.dataset.rotateCursor;
  if (!url) return;

  const scale = parseScale($el.dataset.rotateCursorScale);

  try {
    const value = await scaledCursorValue(url, scale);
    if (!value) return;

    $el.style.setProperty('--model-3d-rotate-cursor', value);
  } catch (error) {
    log.debug(`ModelViewer: failed to apply rotate cursor ${url}`, error);
  }
}

function parseScale(value: string | undefined): number {
  if (value === undefined || value === '') return 1;

  const scale = Number.parseFloat(value);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

async function scaledCursorValue(
  url: string,
  scale: number,
): Promise<string | undefined> {
  const response = await fetch(url);
  if (!response.ok) return undefined;

  const contentType = response.headers.get('content-type') ?? '';
  const isSvg =
    contentType.includes('svg') ||
    stripQuery(url).toLowerCase().endsWith('.svg');

  if (isSvg) return cursorFromSvg(await response.text(), scale);

  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    return await cursorFromRaster(objectUrl, scale);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function cursorFromSvg(svgText: string, scale: number): string | undefined {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return undefined;

  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg') return undefined;

  const intrinsic = intrinsicSvgSize(svg);
  const { width, height } = clampSize(
    intrinsic.width * scale,
    intrinsic.height * scale,
  );

  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));

  const serialized = new XMLSerializer().serializeToString(svg);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
  const { x, y } = center(width, height);

  return `url("${dataUrl}") ${x} ${y}, grab`;
}

async function cursorFromRaster(
  url: string,
  scale: number,
): Promise<string | undefined> {
  const img = await loadImage(url);
  const { width, height } = clampSize(
    (img.naturalWidth || DEFAULT_CURSOR_PX) * scale,
    (img.naturalHeight || DEFAULT_CURSOR_PX) * scale,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  ctx.drawImage(img, 0, 0, width, height);

  const { x, y } = center(width, height);
  return `url("${canvas.toDataURL('image/png')}") ${x} ${y}, grab`;
}

function intrinsicSvgSize(svg: Element): { width: number; height: number } {
  const viewBox = svg
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const vbWidth =
    viewBox?.length === 4 && viewBox[2]! > 0 ? viewBox[2] : undefined;
  const vbHeight =
    viewBox?.length === 4 && viewBox[3]! > 0 ? viewBox[3] : undefined;

  return {
    width:
      parseAbsoluteLength(svg.getAttribute('width')) ??
      vbWidth ??
      DEFAULT_CURSOR_PX,
    height:
      parseAbsoluteLength(svg.getAttribute('height')) ??
      vbHeight ??
      DEFAULT_CURSOR_PX,
  };
}

function parseAbsoluteLength(value: string | null): number | undefined {
  if (!value || value.includes('%')) return undefined;

  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function clampSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  const fit = longest > MAX_CURSOR_PX ? MAX_CURSOR_PX / longest : 1;

  return {
    width: Math.max(1, Math.round(width * fit)),
    height: Math.max(1, Math.round(height * fit)),
  };
}

function center(width: number, height: number): { x: number; y: number } {
  return { x: Math.round(width / 2), y: Math.round(height / 2) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to decode ${url}`));
    img.src = url;
  });
}

function stripQuery(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}
