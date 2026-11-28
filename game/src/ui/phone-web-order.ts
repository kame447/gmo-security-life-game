import type { WebOrderQuote, WebOrderResult } from '../phone/web/commerce';

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};
const yen = (amount: number) => `${amount.toLocaleString('ja-JP')}円`;

export function renderWebOrder(quote: WebOrderQuote, purchase: () => WebOrderResult): HTMLElement {
  const root = make('section', 'phone-web-order', '');
  root.setAttribute('aria-label', '自転車の注文');
  root.append(make('p', 'phone-web-order-product', quote.product),
    make('p', 'phone-web-order-price', yen(quote.priceYen)),
    make('p', 'phone-web-order-budget', `購入予算 ${yen(quote.budgetYen)}`));
  const panel = make('div', 'phone-web-order-actions', '');
  const message = make('p', 'phone-web-order-message', quote.message);
  message.setAttribute('role', 'status');
  const button = (label: string, className: string) => {
    const item = make('button', className, label);
    item.type = 'button';
    return item;
  };
  const showStart = () => {
    const order = button('注文へ進む', 'phone-web-order-start');
    order.disabled = !quote.available;
    order.addEventListener('click', () => {
      const description = make('p', 'phone-web-order-confirmation',
        `${quote.seller}に${yen(quote.priceYen)}で注文します。予算の残りは${yen(quote.budgetYen - quote.priceYen)}です。`);
      const confirm = button('注文を確定する', 'phone-web-order-confirm');
      const cancel = button('戻る', 'phone-web-order-cancel');
      confirm.addEventListener('click', () => {
        if (confirm.disabled) return;
        confirm.disabled = true;
        const result = purchase();
        message.textContent = result.message;
        if (result.ok) panel.replaceChildren(make('p', 'phone-web-order-complete', '注文完了'));
        else { showStart(); panel.querySelector('button')?.focus(); }
      });
      cancel.addEventListener('click', () => { showStart(); panel.querySelector('button')?.focus(); });
      panel.replaceChildren(description, confirm, cancel);
      cancel.focus({ preventScroll: true });
    });
    panel.replaceChildren(order);
  };
  showStart();
  root.append(message, panel);
  return root;
}
