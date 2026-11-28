import { bicycleStorefront } from '../data/bicycle-web';
import type { WebPage } from '../phone/web/types';
import type { WebOrderQuote, WebOrderResult } from '../phone/web/commerce';
import { bicycleProductArt } from './phone-web-bicycle-art';
import { webElement as el, webButton as button, webFacts as facts, webLink as link } from './phone-web-elements';
import { renderWebOrder } from './phone-web-order';

type Commerce = { quote: WebOrderQuote | null; purchase: (address: string) => WebOrderResult };

export function renderBicycleStorefront(page: WebPage, open: (href: string) => void, commerce?: Commerce): HTMLElement | null {
  const data = bicycleStorefront(page.address);
  if (!data) return null;
  const { offer, profile, section } = data;
  const root = el('article', `phone-web-page bicycle-store bicycle-store-${profile.theme}`);
  root.dataset.storefront = profile.theme;
  const companyAddress = new URL('/company', offer.address).href, deliveryAddress = new URL('/delivery', offer.address).href;
  const campaign = el('p', 'bicycle-store-campaign', profile.campaign);
  const header = el('header', 'bicycle-store-header');
  const brand = button('', () => open(offer.address), 'bicycle-store-brand');
  brand.append(el('span', 'bicycle-store-wordmark', profile.brand), el('span', 'bicycle-store-brand-caption', profile.brandCaption));
  const mark = el('span', 'bicycle-store-mark', profile.theme === 'machikado' ? '町' : profile.theme === 'hayate' ? 'H' : 'CS');
  mark.setAttribute('aria-hidden', 'true');
  header.append(brand, mark);
  const nav = el('nav', 'bicycle-store-nav'); nav.setAttribute('aria-label', `${offer.seller}のメニュー`);
  for (const [name, href, active] of [
    ['商品', offer.address, section === 'product'], ['お届け・お支払い', deliveryAddress, section === 'delivery'], ['会社案内', companyAddress, section === 'company'],
  ] as const) {
    const navLink = link(name, href, open, active ? 'is-current' : '');
    if (active) navLink.setAttribute('aria-current', 'page');
    nav.append(navLink);
  }
  root.append(campaign, header, nav);
  if (section !== 'product') {
    const info = el('section', 'bicycle-store-info');
    info.append(el('p', 'site-eyebrow', section === 'company' ? 'ABOUT US' : 'SHOPPING GUIDE'),
      el('h1', 'phone-web-title', section === 'company' ? '会社案内' : 'お届け・お支払い'),
      el('p', 'site-intro', section === 'company' ? 'ご注文前に、販売者と連絡窓口をご確認ください。' : 'ご注文から受け取りまでの流れをご案内します。'),
      facts(section === 'company' ? profile.company : profile.delivery));
    if (section === 'company') info.append(el('p', 'bicycle-store-info-note', '特定商取引法に基づく表記'));
    info.append(link('商品ページへ戻る →', offer.address, open, 'site-return-link'));
    root.append(info);
  } else {
    const hero = el('section', 'bicycle-store-hero');
    const headline = el('h1', 'phone-web-title bicycle-store-catchline');
    const phrases = profile.catchline.split('、');
    phrases.forEach((phrase, index) => headline.append(el('span', 'bicycle-store-catchline-phrase', phrase + (index < phrases.length - 1 ? '、' : ''))));
    hero.append(el('p', 'site-eyebrow', profile.collection), headline);
    const heroPrice = el('p', 'bicycle-store-hero-price');
    heroPrice.append(el('span', '', `¥${offer.priceYen.toLocaleString('ja-JP')}`), el('small', '', '税込'));
    hero.append(heroPrice);
    const frame = el('div', 'bicycle-store-art');
    let selectedColor = 0, selectedView: 'side' | 'basket' | 'frame' = 'side';
    const art = el('div', 'bicycle-store-art-image');
    const artLabel = el('p', 'bicycle-store-art-label');
    const updateArt = () => {
      art.replaceChildren(bicycleProductArt(profile.colors[selectedColor].value, selectedView));
      artLabel.textContent = `${profile.productName} / ${profile.colors[selectedColor].name}`;
    };
    updateArt();
    frame.append(art, artLabel); hero.append(frame);
    const gallery = el('div', 'bicycle-store-gallery'); gallery.setAttribute('aria-label', '商品画像の表示');
    for (const [view, label] of [['side', '全体'], ['basket', '前かご'], ['frame', 'フレーム']] as const) {
      const item = button(label, () => {
        selectedView = view; updateArt();
        for (const child of gallery.querySelectorAll('button')) child.setAttribute('aria-pressed', String(child === item));
      }, 'bicycle-store-gallery-button');
      item.dataset.bicycleView = view; item.setAttribute('aria-pressed', String(view === selectedView)); gallery.append(item);
    }
    hero.append(gallery); root.append(hero);
    const product = el('section', 'bicycle-store-product');
    const productMeta = el('div', 'bicycle-store-product-meta');
    productMeta.append(el('span', 'bicycle-store-category', 'シティサイクル'), el('span', 'bicycle-store-stock', '在庫あり'));
    product.append(productMeta, el('h2', 'bicycle-store-product-name', profile.productName));
    const price = el('p', 'bicycle-store-price'); price.append(el('span', '', `¥${offer.priceYen.toLocaleString('ja-JP')}`), el('small', '', '税込・送料込み'));
    product.append(price);
    if (profile.theme === 'select') product.append(el('p', 'bicycle-store-offer-note', '通常掲載価格 ¥25,600 → SEASON OFFER 50% OFF'));
    const colors = el('div', 'bicycle-store-colors');
    const colorLabel = el('p', 'bicycle-store-color-label', `カラー見本：${profile.colors[0].name}`);
    const colorButtons = el('div', 'bicycle-store-color-buttons');
    profile.colors.forEach((color, index) => {
      const item = button('', () => {
        selectedColor = index; updateArt(); colorLabel.textContent = `カラー見本：${color.name}`;
        for (const child of colorButtons.querySelectorAll('button')) child.setAttribute('aria-pressed', String(child === item));
      }, 'bicycle-store-color');
      item.setAttribute('aria-label', `${color.name}の画像を見る`); item.setAttribute('aria-pressed', String(index === 0));
      item.style.setProperty('--swatch', color.value); item.dataset.bicycleColor = color.name; colorButtons.append(item);
    });
    colors.append(colorLabel, colorButtons); product.append(colors);
    const benefits = el('div', 'bicycle-store-benefits');
    for (const value of profile.benefits) benefits.append(el('span', '', value));
    product.append(benefits, el('p', 'bicycle-store-description', profile.description));
    const delivery = el('div', 'bicycle-store-delivery');
    delivery.append(el('span', 'bicycle-store-delivery-label', profile.theme === 'machikado' ? 'お店で受け取る' : 'ご自宅へ配送'),
      el('p', '', profile.deliverySummary), link('お届け・お支払いを確認 →', deliveryAddress, open));
    product.append(delivery);
    if (commerce?.quote) product.append(renderWebOrder(commerce.quote, () => commerce.purchase(page.address)));
    const specifications = el('section', 'bicycle-store-specifications');
    specifications.append(el('p', 'site-eyebrow', 'PRODUCT DETAILS'), el('h2', '', '毎日使うから、細部まで。'), facts(profile.specs));
    product.append(specifications);
    const care = el('section', 'bicycle-store-care');
    care.append(el('h2', '', 'ご購入前に'), el('p', '', '価格だけでなく、受け取り方・支払い方法・購入後の対応もご確認ください。'),
      link('会社案内・特定商取引法に基づく表記 →', companyAddress, open), link('送料・お支払い・返品について →', deliveryAddress, open));
    product.append(care); root.append(product);
  }
  const footer = el('footer', 'bicycle-store-footer');
  footer.append(el('span', '', profile.brand), el('small', '', '暮らしのためのサイクルストア'));
  root.append(footer);
  return root;
}
