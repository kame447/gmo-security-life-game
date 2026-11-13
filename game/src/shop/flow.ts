/** 一覧 → 選択・確認 → 結果。結果を明示的に戻すまで決定操作は無効（連打で再購入しない）。 */
import type { ShopDefinition } from '../data/shops';
import { purchase, type PurchaseResult, type ShopAssetsPort, type ShopOffer } from './purchase';

export type ShopPhase = 'browse' | 'confirm' | 'result' | 'closed';

export class ShopFlow {
  private currentPhase: ShopPhase = 'browse';
  private selected = 0;
  private outcome: PurchaseResult | null = null;

  constructor(readonly shop: ShopDefinition, private readonly assets: ShopAssetsPort) {}

  get phase(): ShopPhase { return this.currentPhase; }
  get selectedIndex(): number { return this.selected; }
  get offer(): ShopOffer | undefined { return this.shop.offers[this.selected]; }
  get result(): PurchaseResult | null { return this.outcome; }
  get balanceYen(): number { return this.assets.moneyYen; }
  get balanceAfterYen(): number { return this.balanceYen - (this.offer?.priceYen ?? 0); }
  get quantity(): number { return this.offer ? this.assets.quantity(this.offer.itemId) : 0; }

  move(step: number): void {
    if (this.phase !== 'browse' || !this.shop.offers.length) return;
    this.selected = (this.selected + step + this.shop.offers.length) % this.shop.offers.length;
  }

  select(index = this.selected): void {
    if (this.phase !== 'browse' || !Number.isInteger(index) || !this.shop.offers[index]) return;
    this.selected = index;
    this.currentPhase = 'confirm';
  }

  confirm(): PurchaseResult | null {
    if (this.phase !== 'confirm' || !this.offer) return null;
    // Move first: even another confirmation in this turn cannot spend twice.
    this.currentPhase = 'result';
    this.outcome = purchase(this.assets, this.offer);
    return this.outcome;
  }

  primaryAction(): void {
    if (this.phase === 'browse') this.select();
    else if (this.phase === 'confirm') this.confirm();
  }

  back(): void {
    if (this.phase === 'confirm' || this.phase === 'result') {
      this.currentPhase = 'browse';
      this.outcome = null;
    } else this.close();
  }

  close(): void { this.currentPhase = 'closed'; }
}
