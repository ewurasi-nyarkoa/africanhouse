import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare const PaystackPop: any;

export interface PaystackResult {
  reference: string;
  status: string;
  trans: string;
  transaction: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {

  openPaystack(email: string, amountGhs: number, metadata: Record<string, any>): Promise<PaystackResult> {
    return new Promise((resolve, reject) => {
      const handler = PaystackPop.setup({
        key: environment.paystackKey,
        email,
        amount: Math.round(amountGhs * 100), // Paystack uses pesewas
        currency: 'GHS',
        metadata,
        callback: (response: PaystackResult) => resolve(response),
        onClose: () => reject(new Error('Payment window closed')),
      });
      handler.openIframe();
    });
  }
}
