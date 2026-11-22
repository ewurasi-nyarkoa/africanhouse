import { sanitizeCampaignHtml } from './email-sanitizer.ts';
import { escapeHtml, safeHttpsUrl } from './escape-html.ts';

const BRAND = {
  name:      'AfriLoom Fabrics',
  tagline:   'Every Fabric Tells a Story.',
  primary:   '#6B1E2B',
  gold:      '#C9A227',
  ivory:     '#F6F1E9',
  charcoal:  '#2B2B2B',
  grey:      '#6b6b6b',
  website:   'https://afriloomfabrics.com',
  phone:     '0240 070 628',
  instagram: 'https://instagram.com/afriloom_fabrics',
  tiktok:    'https://www.tiktok.com/@afriloom_fabrics',
};

function baseLayout(content: string, unsubscribeUrl?: string): string {
  const footer = unsubscribeUrl
    ? `<p style="margin:0 0 8px;">
         <a href="${safeHttpsUrl(unsubscribeUrl)}" style="color:#9b8b7a;font-size:12px;">Unsubscribe from marketing emails</a>
       </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${BRAND.name}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.ivory};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.ivory};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-top:3px solid ${BRAND.primary};">

        <!-- HEADER -->
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #ede6d8;">
            <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-style:italic;font-weight:400;color:${BRAND.charcoal};letter-spacing:0.02em;">${BRAND.name}</p>
            <p style="margin:4px 0 0;font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.gold};">${BRAND.tagline}</p>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr><td style="padding:32px 40px;">${content}</td></tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:24px 40px 32px;border-top:1px solid #ede6d8;background:#faf7f3;">
            ${footer}
            <p style="margin:0 0 8px;font-size:12px;color:#9b8b7a;">
              <a href="${BRAND.website}" style="color:#9b8b7a;">afriloomfabrics.com</a>
              &nbsp;·&nbsp; ${BRAND.phone}
            </p>
            <p style="margin:0;font-size:11px;color:#b0a898;">
              Amasaman, Greater Accra Region, Ghana
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function welcomeEmail(firstName: string, unsubscribeUrl?: string): string {
  const content = `
    <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:28px;font-style:italic;font-weight:400;color:${BRAND.charcoal};">
      Welcome, ${escapeHtml(firstName)}.
    </h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4a4a4a;">
      Thank you for joining AfriLoom Fabrics. We're glad you're here.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4a4a4a;">
      We carefully select GTP, Ankara, Kente, damask, voile and brocade fabrics — sold unsewn by the yard so your tailor can create something that is entirely yours.
    </p>
    <div style="border-left:3px solid ${BRAND.gold};padding:12px 20px;margin:24px 0;background:#faf7f3;">
      <p style="margin:0;font-family:Georgia,serif;font-size:16px;font-style:italic;color:${BRAND.charcoal};">
        Every fabric tells a story. Yours starts here.
      </p>
    </div>
    <p style="margin:0 0 32px;font-size:15px;line-height:1.7;color:#4a4a4a;">
      Browse our latest collection and find the perfect fabric for your next occasion.
    </p>
    <a href="${BRAND.website}/shop"
       style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">
      Shop Fabrics
    </a>
  `;
  return baseLayout(content, unsubscribeUrl);
}

export interface OrderItem {
  fabric_name: string;
  yards:       number;
  price_per_yard: number;
  subtotal:    number;
}

export function orderConfirmationEmail(
  customerName: string,
  orderId: number,
  items: OrderItem[],
  totalAmount: number,
  discountAmount: number,
  location: string,
  trackingUrl: string,
): string {
  const rows = items.map(i => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #ede6d8;font-size:14px;color:${BRAND.charcoal};">${escapeHtml(i.fabric_name)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #ede6d8;font-size:14px;color:${BRAND.grey};text-align:center;">${escapeHtml(i.yards)} yds</td>
      <td style="padding:10px 0;border-bottom:1px solid #ede6d8;font-size:14px;color:${BRAND.charcoal};text-align:right;">GH₵ ${escapeHtml(Number(i.subtotal).toFixed(2))}</td>
    </tr>
  `).join('');

  const discountRow = discountAmount > 0
     ? `<tr><td colspan="2" style="padding:8px 0;font-size:13px;color:#2a6a2a;">Discount</td>
       <td style="padding:8px 0;font-size:13px;color:#2a6a2a;text-align:right;">− GH₵ ${escapeHtml(Number(discountAmount).toFixed(2))}</td></tr>`
    : '';

  const content = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;font-style:italic;font-weight:400;color:${BRAND.charcoal};">
      Order Confirmed
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a4a4a;">
      Thank you, ${escapeHtml(customerName)}. Your payment was successful and your order is confirmed.
    </p>

    <div style="background:#faf7f3;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:${BRAND.grey};">Order Reference</p>
      <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-style:italic;color:${BRAND.primary};">#${escapeHtml(orderId)}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <th style="text-align:left;padding-bottom:10px;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.grey};border-bottom:2px solid ${BRAND.primary};">Fabric</th>
        <th style="text-align:center;padding-bottom:10px;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.grey};border-bottom:2px solid ${BRAND.primary};">Qty</th>
        <th style="text-align:right;padding-bottom:10px;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.grey};border-bottom:2px solid ${BRAND.primary};">Amount</th>
      </tr>
      ${rows}
      ${discountRow}
      <tr>
        <td colspan="2" style="padding:12px 0 0;font-size:16px;font-weight:600;color:${BRAND.charcoal};">Total Paid</td>
        <td style="padding:12px 0 0;font-size:16px;font-weight:600;color:${BRAND.charcoal};text-align:right;">GH₵ ${escapeHtml(Number(totalAmount).toFixed(2))}</td>
      </tr>
    </table>

    <div style="border-left:3px solid ${BRAND.gold};padding:12px 20px;margin:0 0 28px;background:#faf7f3;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.grey};">Delivery to</p>
      <p style="margin:0;font-size:14px;color:${BRAND.charcoal};">${escapeHtml(location)}</p>
    </div>

    <p style="margin:0 0 8px;font-size:14px;color:#4a4a4a;line-height:1.65;">
      We will contact you on the phone number you provided to arrange delivery. If you have any questions, call us on <strong>${BRAND.phone}</strong>.
    </p>
    <p style="margin:0 0 28px;font-size:14px;color:#4a4a4a;line-height:1.65;">
      Remember: all fabrics are sold unsewn. Take your fabric to your tailor to create something entirely yours.
    </p>

    <a href="${safeHttpsUrl(trackingUrl)}"
       style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">
      Track Your Order
    </a>
  `;
  return baseLayout(content);
}

export function campaignEmail(
  subject: string,
  bodyHtml: string,
  subscriberName: string,
  unsubscribeUrl: string,
): string {
  const safeBody = sanitizeCampaignHtml(bodyHtml);
  const personalised = safeBody.replace(/\{\{name\}\}/gi, escapeHtml(subscriberName || 'Valued Customer'));
  return baseLayout(personalised, unsubscribeUrl);
}
