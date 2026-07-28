/**
 * Minimal DOM construction helpers.
 *
 * Everything user-facing is built from real nodes with `textContent` rather
 * than concatenated HTML strings. The original map escaped most interpolations
 * with an `esc()` helper but missed two — `tier` went straight into a `class`
 * attribute in both the popup and the marker icon — which is exactly the
 * failure mode string concatenation invites. Nodes make it unrepresentable.
 */

type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  return node;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

/** Throws rather than returning null — a missing mount point is a build error. */
export function mustFind<T extends Element = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Expected element "${selector}" to exist in index.html`);
  return node;
}

/**
 * Builds an anchor when a URL is present and a plain span otherwise, so
 * link-less members still render as readable text instead of a dead link.
 */
export function nameNode(name: string, url: string | null, className: string): HTMLElement {
  if (!url) return el('span', { class: className, text: name });
  return el('a', {
    class: className,
    href: url,
    // Popups open in the host page's parent context when embedded.
    target: '_blank',
    rel: 'noopener noreferrer',
    text: name,
  });
}
