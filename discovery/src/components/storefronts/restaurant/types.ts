export interface RestaurantDemoBasketLine {
  merchantId: string;
  itemId: string;
  quantity: number;
  unitTotal: number;
  currency: string;
  selectedOptionIds: string[];
}
