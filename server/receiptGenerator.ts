import type { OrderWithDetails, Setting } from "@shared/schema";

export interface RestaurantInfo {
  name: string;
  address: string;
  phone: string;
  vatNumber?: string;
  website?: string;
  email?: string;
  logoUrl?: string;
}

export interface PaymentInfo {
  method: string;
  amount: number;
  received?: number;
  change?: number;
  transactionId?: string;
}

/**
 * Formats a number as Euro currency (€)
 */
function formatCurrency(amount: number | string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(numAmount);
}

/**
 * Formats a date in Italian format (DD/MM/YYYY HH:mm)
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * Truncate text to fit within specified width (for monospace font)
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text;
  }
  return text.substring(0, maxWidth - 3) + '...';
}

/**
 * Pad text with spaces to align right within specified width
 */
function padRight(text: string, width: number): string {
  return text.padEnd(width, ' ');
}

/**
 * Create a line with text on left and price on right, properly aligned
 */
function createAlignedLine(leftText: string, rightText: string, maxWidth: number = 42): string {
  const rightPadding = rightText.length;
  const availableLeft = maxWidth - rightPadding;
  const truncatedLeft = truncateText(leftText, availableLeft);
  const spacesNeeded = maxWidth - truncatedLeft.length - rightPadding;
  return truncatedLeft + ' '.repeat(Math.max(1, spacesNeeded)) + rightText;
}

/**
 * Generate thermal printer optimized CSS
 */
function generateReceiptCSS(): string {
  return `
    <style>
      @media print {
        @page {
          size: 80mm auto;
          margin: 0;
        }
        
        body {
          margin: 0;
          padding: 0;
        }
      }
      
      .receipt {
        width: 80mm;
        max-width: 80mm;
        font-family: 'Courier New', 'Lucida Console', monospace;
        font-size: 10px;
        line-height: 1.2;
        color: #000;
        background: #fff;
        margin: 0 auto;
        padding: 2mm;
        box-sizing: border-box;
      }
      
      .receipt-header {
        text-align: center;
        margin-bottom: 8px;
        border-bottom: 1px dashed #000;
        padding-bottom: 8px;
      }
      
      .restaurant-logo {
        max-width: 60mm;
        max-height: 20mm;
        margin: 0 auto 4px;
        display: block;
      }
      
      .restaurant-name {
        font-size: 14px;
        font-weight: bold;
        margin: 2px 0;
        text-transform: uppercase;
      }
      
      .restaurant-info {
        font-size: 9px;
        margin: 1px 0;
        line-height: 1.1;
      }
      
      .order-info {
        margin: 8px 0;
        font-size: 10px;
        border-bottom: 1px dashed #000;
        padding-bottom: 8px;
      }
      
      .order-info-line {
        display: flex;
        justify-content: space-between;
        margin: 2px 0;
      }
      
      .items-section {
        margin: 8px 0;
      }
      
      .items-header {
        font-weight: bold;
        border-bottom: 1px solid #000;
        padding: 2px 0;
        margin-bottom: 4px;
      }
      
      .item-line {
        margin: 3px 0;
        font-family: 'Courier New', 'Lucida Console', monospace;
        font-size: 10px;
        white-space: pre;
      }
      
      .item-name {
        font-weight: bold;
      }
      
      .item-details {
        font-size: 9px;
        margin-left: 2px;
        color: #444;
      }
      
      .totals-section {
        border-top: 1px dashed #000;
        padding-top: 8px;
        margin: 8px 0;
      }
      
      .total-line {
        display: flex;
        justify-content: space-between;
        margin: 2px 0;
        font-family: 'Courier New', 'Lucida Console', monospace;
      }
      
      .total-line.final {
        font-weight: bold;
        font-size: 12px;
        border-top: 1px solid #000;
        border-bottom: 1px double #000;
        padding: 4px 0;
        margin: 6px 0;
      }
      
      .payment-section {
        border-top: 1px dashed #000;
        padding-top: 8px;
        margin: 8px 0;
      }
      
      .payment-line {
        display: flex;
        justify-content: space-between;
        margin: 2px 0;
      }
      
      .receipt-footer {
        text-align: center;
        margin-top: 12px;
        border-top: 1px dashed #000;
        padding-top: 8px;
        font-size: 9px;
      }
      
      .thank-you {
        font-weight: bold;
        margin: 6px 0;
        text-transform: uppercase;
      }
      
      .tax-info {
        font-size: 8px;
        margin: 4px 0;
        color: #666;
      }
      
      .qr-code {
        margin: 8px auto;
        text-align: center;
      }
      
      .separator {
        text-align: center;
        margin: 6px 0;
        font-weight: bold;
      }
      
      /* Hide elements not needed for print */
      @media print {
        .no-print {
          display: none !important;
        }
      }
    </style>
  `;
}

/**
 * Generate the main receipt HTML content
 */
function generateReceiptHTML(
  order: OrderWithDetails,
  restaurantInfo: RestaurantInfo,
  paymentInfo: PaymentInfo
): string {
  const orderDate = formatDate(order.createdAt ? new Date(order.createdAt) : new Date());
  
  // Calculate totals if not present
  const subtotal = parseFloat(order.subtotal?.toString() || '0');
  const tax = parseFloat(order.tax?.toString() || '0');
  const total = parseFloat(order.total?.toString() || '0');
  
  let itemsHTML = '';
  
  // Generate items list
  order.orderLines.forEach((line) => {
    const itemTotal = parseFloat(line.totalPrice?.toString() || '0');
    const unitPrice = parseFloat(line.unitPrice?.toString() || '0');
    const quantity = line.quantity || 1;
    
    // Item name line
    itemsHTML += `<div class="item-line item-name">${truncateText(line.menuItem.name, 42)}</div>\n`;
    
    // Quantity and price line
    const priceLine = createAlignedLine(
      `  ${quantity} x ${formatCurrency(unitPrice)}`,
      formatCurrency(itemTotal)
    );
    itemsHTML += `<div class="item-line">${priceLine}</div>\n`;
    
    // Add modifiers/notes if present
    if (line.notes) {
      itemsHTML += `<div class="item-details">  Note: ${truncateText(line.notes, 38)}</div>\n`;
    }
    
    if (line.modifiers) {
      try {
        const modifiers = JSON.parse(line.modifiers);
        if (Array.isArray(modifiers) && modifiers.length > 0) {
          itemsHTML += `<div class="item-details">  ${truncateText(modifiers.join(', '), 38)}</div>\n`;
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
    
    itemsHTML += '\n';
  });
  
  // Payment details
  let paymentHTML = '';
  paymentHTML += `<div class="payment-line"><span>Metodo:</span><span>${paymentInfo.method.toUpperCase()}</span></div>\n`;
  paymentHTML += `<div class="payment-line"><span>Importo:</span><span>${formatCurrency(paymentInfo.amount)}</span></div>\n`;
  
  if (paymentInfo.received && paymentInfo.received > paymentInfo.amount) {
    paymentHTML += `<div class="payment-line"><span>Ricevuto:</span><span>${formatCurrency(paymentInfo.received)}</span></div>\n`;
    paymentHTML += `<div class="payment-line"><span>Resto:</span><span>${formatCurrency(paymentInfo.change || 0)}</span></div>\n`;
  }
  
  if (paymentInfo.transactionId) {
    paymentHTML += `<div class="payment-line"><span>Trans. ID:</span><span>${paymentInfo.transactionId}</span></div>\n`;
  }
  
  return `
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=80mm">
        <title>Scontrino #${order.orderNumber}</title>
        ${generateReceiptCSS()}
    </head>
    <body>
        <div class="receipt">
            <!-- Header -->
            <div class="receipt-header">
                ${restaurantInfo.logoUrl ? `<img src="${restaurantInfo.logoUrl}" alt="Logo" class="restaurant-logo">` : ''}
                <div class="restaurant-name">${restaurantInfo.name}</div>
                ${restaurantInfo.address ? `<div class="restaurant-info">${restaurantInfo.address}</div>` : ''}
                ${restaurantInfo.phone ? `<div class="restaurant-info">Tel: ${restaurantInfo.phone}</div>` : ''}
                ${restaurantInfo.email ? `<div class="restaurant-info">${restaurantInfo.email}</div>` : ''}
                ${restaurantInfo.website ? `<div class="restaurant-info">${restaurantInfo.website}</div>` : ''}
            </div>
            
            <!-- Order Info -->
            <div class="order-info">
                <div class="order-info-line">
                    <span>Ordine #:</span>
                    <span>${order.orderNumber}</span>
                </div>
                <div class="order-info-line">
                    <span>Data:</span>
                    <span>${orderDate}</span>
                </div>
                ${order.table ? `
                <div class="order-info-line">
                    <span>Tavolo:</span>
                    <span>${order.table.number}</span>
                </div>
                ` : ''}
                ${order.waiter ? `
                <div class="order-info-line">
                    <span>Operatore:</span>
                    <span>${order.waiter.firstName} ${order.waiter.lastName}</span>
                </div>
                ` : ''}
            </div>
            
            <!-- Items -->
            <div class="items-section">
                <div class="items-header">${createAlignedLine('ARTICOLI', 'IMPORTO')}</div>
                <div class="separator">----------------------------------------</div>
                ${itemsHTML}
            </div>
            
            <!-- Totals -->
            <div class="totals-section">
                <div class="separator">----------------------------------------</div>
                <div class="total-line">
                    <span>Subtotale:</span>
                    <span>${formatCurrency(subtotal)}</span>
                </div>
                ${tax > 0 ? `
                <div class="total-line">
                    <span>IVA:</span>
                    <span>${formatCurrency(tax)}</span>
                </div>
                ` : ''}
                <div class="total-line final">
                    <span>TOTALE:</span>
                    <span>${formatCurrency(total)}</span>
                </div>
            </div>
            
            <!-- Payment -->
            <div class="payment-section">
                <div class="separator">========================================</div>
                <div style="text-align: center; font-weight: bold; margin: 4px 0;">PAGAMENTO</div>
                ${paymentHTML}
            </div>
            
            <!-- Footer -->
            <div class="receipt-footer">
                <div class="thank-you">Grazie per la visita!</div>
                <div class="separator">----------------------------------------</div>
                ${restaurantInfo.vatNumber ? `
                <div class="tax-info">P.IVA: ${restaurantInfo.vatNumber}</div>
                ` : ''}
                <div class="tax-info">Scontrino non fiscale</div>
                <div class="tax-info">Conservare per eventuali reclami</div>
                
                ${order.qrCode ? `
                <div class="qr-code">
                    <img src="${order.qrCode}" alt="QR Code" style="width: 15mm; height: 15mm;">
                </div>
                ` : ''}
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Parse restaurant settings from database settings array
 */
export function parseRestaurantInfo(settings: Setting[]): RestaurantInfo {
  const settingsMap = new Map(settings.map(s => [s.key, s.value]));
  
  return {
    name: settingsMap.get('restaurant_name') || 'Ristorante',
    address: settingsMap.get('restaurant_address') || '',
    phone: settingsMap.get('restaurant_phone') || '',
    vatNumber: settingsMap.get('restaurant_vat') || '',
    website: settingsMap.get('restaurant_website') || '',
    email: settingsMap.get('restaurant_email') || '',
    logoUrl: settingsMap.get('restaurant_logo_url') || '',
  };
}

/**
 * Generate customer receipt HTML for thermal printer
 * Main export function
 */
export function generateCustomerReceipt(
  order: OrderWithDetails,
  restaurantInfo: RestaurantInfo,
  paymentInfo: PaymentInfo
): string {
  return generateReceiptHTML(order, restaurantInfo, paymentInfo);
}

/**
 * Generate customer receipt using settings from database
 */
export function generateCustomerReceiptFromSettings(
  order: OrderWithDetails,
  settings: Setting[],
  paymentInfo: PaymentInfo
): string {
  const restaurantInfo = parseRestaurantInfo(settings);
  return generateCustomerReceipt(order, restaurantInfo, paymentInfo);
}