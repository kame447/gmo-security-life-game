/** 店員の既存挨拶 → 会話の選択 → 商品 → 確認 → 結果 → 店内。DOM非依存。 */
import type { ShopCatalog } from '../data/shop-catalogs';
import { purchase, type PurchaseResult, type ShopAssetsPort } from './purchase';

export interface ClerkGreeting { readonly speaker: string; readonly lines: readonly string[] }
export type ClerkPhase = 'greeting' | 'choice' | 'catalog' | 'confirm' | 'receipt' | 'closed';

export class ClerkFlow {
  private phaseValue: ClerkPhase;
  private lineIndex = 0;
  private offerIndex = 0;
  private choiceValue = 0;
  private purchaseValue: PurchaseResult | null = null;

  constructor(readonly catalog: ShopCatalog, readonly greeting: ClerkGreeting, private readonly assets: ShopAssetsPort) {
    this.phaseValue = greeting.lines.length ? 'greeting' : 'choice';
  }
  get phase(): ClerkPhase { return this.phaseValue; }
  get greetingLine(): string { return this.greeting.lines[this.lineIndex] ?? ''; }
  get selectedIndex(): number { return this.offerIndex; }
  get choiceIndex(): number { return this.choiceValue; }
  get offer() { return this.catalog.offers[this.offerIndex]; }
  get balanceYen(): number { return this.assets.moneyYen; }
  get balanceAfterYen(): number { return this.balanceYen - (this.offer?.priceYen ?? 0); }
  get quantity(): number { return this.offer ? this.assets.quantity(this.offer.itemId) : 0; }
  get result(): PurchaseResult | null { return this.purchaseValue; }

  move(step: number): void {
    if (this.phase === 'catalog' && this.catalog.offers.length) this.selectOffer((this.offerIndex + step + this.catalog.offers.length) % this.catalog.offers.length);
    else if (this.phase === 'choice' || this.phase === 'confirm') this.choiceValue = (this.choiceValue + step + 2) % 2;
  }
  selectOffer(index: number): void {
    if (this.phase === 'catalog' && Number.isInteger(index) && this.catalog.offers[index]) this.offerIndex = index;
  }
  advanceGreeting(): void {
    if (this.phase !== 'greeting') return;
    if (this.lineIndex + 1 < this.greeting.lines.length) this.lineIndex++;
    else this.phaseValue = 'choice';
  }
  chooseBuy(): void { if (this.phase === 'choice') this.phaseValue = 'catalog'; }
  reviewPurchase(): void {
    if (this.phase !== 'catalog' || !this.offer) return;
    this.phaseValue = 'confirm';
    this.choiceValue = 0;
  }
  confirmPurchase(): PurchaseResult | null {
    if (this.phase !== 'confirm' || !this.offer) return null;
    this.phaseValue = 'receipt';
    this.purchaseValue = purchase(this.assets, this.offer);
    return this.purchaseValue;
  }
  browseAgain(): void {
    if (this.phase !== 'receipt' && this.phase !== 'confirm') return;
    this.phaseValue = 'catalog';
    this.purchaseValue = null;
  }
  back(): void {
    if (this.phase === 'confirm') this.browseAgain();
    else if (this.phase === 'catalog') { this.phaseValue = 'choice'; this.choiceValue = 0; }
    else this.close();
  }
  primaryAction(): void {
    if (this.phase === 'greeting') this.advanceGreeting();
    else if (this.phase === 'choice') { if (this.choiceValue === 0) this.chooseBuy(); else this.close(); }
    else if (this.phase === 'catalog') this.reviewPurchase();
    else if (this.phase === 'confirm') { if (this.choiceValue === 0) this.confirmPurchase(); else this.browseAgain(); }
    else if (this.phase === 'receipt') this.close();
  }
  close(): void { this.phaseValue = 'closed'; }
}
