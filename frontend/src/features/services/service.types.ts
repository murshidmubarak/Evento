export interface Service {
  _id: string;
  name: string;
  description: string;
  pricingType: 'per_guest' | 'per_event' | 'package';
  basePrice?: number;
  isActive: boolean;
}
