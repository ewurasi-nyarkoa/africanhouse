import { Fabric } from './fabric';

export interface CartItem {
  fabric: Fabric;
  yards: number;
}

export interface Order {
  id?: string;
  items: CartItem[];
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: 'mtn-momo' | 'vodafone-cash' | 'bank-transfer';
  status: 'pending' | 'confirmed' | 'fulfilled';
  createdAt?: Date;
}
