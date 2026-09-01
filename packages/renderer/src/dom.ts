const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Creates an element and fills it using `textContent` only.
 *
 * Terminalogue never passes block content through `innerHTML`, so anything a
 * document contains, including `<script>` or `onerror=` attributes, ends up as
 * literal terminal text.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface IconPath {
  d: string;
  /** `fill` renders a solid shape, `stroke` an outline. */
  paint?: 'fill' | 'stroke';
}

/** Builds an inline SVG icon without touching `innerHTML`. */
export function icon(doc: Document, className: string, paths: IconPath[]): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const path of paths) {
    const node = doc.createElementNS(SVG_NS, 'path');
    node.setAttribute('d', path.d);
    if (path.paint === 'stroke') {
      node.setAttribute('fill', 'none');
      node.setAttribute('stroke', 'currentColor');
      node.setAttribute('stroke-width', '1.6');
      node.setAttribute('stroke-linecap', 'round');
    } else {
      node.setAttribute('fill', 'currentColor');
    }
    svg.appendChild(node);
  }
  return svg;
}

export const PLAY_ICON: IconPath[] = [{ d: 'M5 3.2 L12.6 8 L5 12.8 Z' }];

export const PAUSE_ICON: IconPath[] = [
  { d: 'M4.6 3.4 h2.4 v9.2 h-2.4 Z' },
  { d: 'M9 3.4 h2.4 v9.2 h-2.4 Z' },
];

export const RESTART_ICON: IconPath[] = [
  { d: 'M8 2.6 A5.4 5.4 0 1 0 13.4 8', paint: 'stroke' },
  { d: 'M8 0.4 L5.4 2.6 L8 4.8 Z' },
];

/** Removes every child of a node without using `innerHTML`. */
export function clearChildren(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
