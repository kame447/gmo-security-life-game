export function webElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function webButton(label: string, action: () => void, className = ''): HTMLButtonElement {
  const button = webElement('button', className, label);
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
}

export function webLink(label: string, href: string, open: (href: string) => void, className = ''): HTMLButtonElement {
  const button = webButton(label, () => open(href), `phone-web-link ${className}`);
  button.dataset.webLink = href;
  return button;
}

export function webFacts(rows: readonly (readonly [string, string])[], className = ''): HTMLDListElement {
  const list = webElement('dl', `site-facts ${className}`);
  for (const [label, value] of rows) {
    const row = webElement('div', 'site-fact');
    row.append(webElement('dt', '', label), webElement('dd', '', value));
    list.append(row);
  }
  return list;
}
