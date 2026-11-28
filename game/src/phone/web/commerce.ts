export interface WebOrderQuote {
  product: string;
  seller: string;
  priceYen: number;
  budgetYen: number;
  available: boolean;
  message: string;
}

export type WebOrderResult = { ok: true; message: string } | { ok: false; message: string };

/** Game-owned purchase rules. The phone only presents and submits the current page's order. */
export interface WebCommercePort {
  quote(address: string): WebOrderQuote | null;
  purchase(address: string): WebOrderResult;
}
