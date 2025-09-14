import type { OrderWithDetails, Department } from "@shared/schema";
import QRCode from 'qrcode';

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
 * Formats time for display (HH:mm)
 */
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
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
 * Create a line with text on left and value on right, properly aligned
 */
function createAlignedLine(leftText: string, rightText: string, maxWidth: number = 42): string {
  const rightPadding = rightText.length;
  const availableLeft = maxWidth - rightPadding;
  const truncatedLeft = truncateText(leftText, availableLeft);
  const spacesNeeded = maxWidth - truncatedLeft.length - rightPadding;
  return truncatedLeft + ' '.repeat(Math.max(1, spacesNeeded)) + rightText;
}

/**
 * Generate CSS optimized for department tickets on 80mm thermal printers
 */
function generateDepartmentTicketCSS(): string {
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
      
      .department-ticket {
        width: 80mm;
        max-width: 80mm;
        font-family: 'Courier New', 'Lucida Console', monospace;
        font-size: 11px;
        line-height: 1.3;
        color: #000;
        background: #fff;
        margin: 0 auto;
        padding: 2mm;
        box-sizing: border-box;
      }
      
      .ticket-header {
        text-align: center;
        margin-bottom: 10px;
        border-bottom: 2px solid #000;
        padding-bottom: 8px;
      }
      
      .department-name {
        font-size: 16px;
        font-weight: bold;
        margin: 4px 0;
        text-transform: uppercase;
        background: #000;
        color: #fff;
        padding: 4px;
        border-radius: 2px;
      }
      
      .ticket-time {
        font-size: 12px;
        font-weight: bold;
        margin: 4px 0;
      }
      
      .order-info {
        margin: 8px 0;
        font-size: 11px;
        border-bottom: 1px dashed #000;
        padding-bottom: 8px;
      }
      
      .order-info-line {
        display: flex;
        justify-content: space-between;
        margin: 3px 0;
        font-weight: bold;
      }
      
      .items-section {
        margin: 10px 0;
      }
      
      .items-header {
        font-weight: bold;
        font-size: 12px;
        text-align: center;
        border-top: 2px solid #000;
        border-bottom: 2px solid #000;
        padding: 4px 0;
        margin-bottom: 8px;
        text-transform: uppercase;
      }
      
      .item-block {
        margin: 8px 0;
        border-bottom: 1px dashed #ccc;
        padding-bottom: 6px;
      }
      
      .item-header {
        display: flex;
        justify-content: space-between;
        font-weight: bold;
        font-size: 12px;
        margin-bottom: 3px;
      }
      
      .item-name {
        font-weight: bold;
        text-transform: uppercase;
      }
      
      .item-quantity {
        font-size: 14px;
        font-weight: bold;
        background: #000;
        color: #fff;
        padding: 2px 6px;
        border-radius: 2px;
        min-width: 20px;
        text-align: center;
      }
      
      .item-details {
        margin: 4px 0;
        padding-left: 4px;
        border-left: 2px solid #ccc;
      }
      
      .item-notes {
        font-weight: bold;
        color: #333;
        background: #f0f0f0;
        padding: 3px;
        margin: 2px 0;
        border-radius: 2px;
      }
      
      .item-modifiers {
        color: #555;
        font-style: italic;
        margin: 2px 0;
      }
      
      .item-allergens {
        font-weight: bold;
        color: #d00;
        background: #ffe0e0;
        padding: 3px;
        margin: 2px 0;
        border-radius: 2px;
        border: 1px solid #fcc;
      }
      
      .prep-time {
        font-weight: bold;
        color: #006600;
        font-size: 10px;
      }
      
      .ticket-footer {
        text-align: center;
        margin-top: 12px;
        border-top: 2px solid #000;
        padding-top: 8px;
        font-size: 10px;
      }
      
      .priority-high {
        background: #ffcccc !important;
        border: 2px solid #ff0000 !important;
      }
      
      .priority-urgent {
        background: #ff0000 !important;
        color: #fff !important;
      }
      
      .separator {
        text-align: center;
        margin: 6px 0;
        font-weight: bold;
      }
      
      .status-indicator {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 9px;
        font-weight: bold;
        text-transform: uppercase;
      }
      
      .status-new {
        background: #ffeb3b;
        color: #000;
      }
      
      .status-preparing {
        background: #2196f3;
        color: #fff;
      }
      
      .status-ready {
        background: #4caf50;
        color: #fff;
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
 * Filter order lines to only include items for the specified department
 */
function filterOrderLinesByDepartment(order: OrderWithDetails, departmentId: string) {
  return order.orderLines.filter(line => 
    line.menuItem.departmentId === departmentId
  );
}

/**
 * Parse allergens from JSON string
 */
function parseAllergens(allergensJson?: string | null): string[] {
  if (!allergensJson) return [];
  try {
    const allergens = JSON.parse(allergensJson);
    return Array.isArray(allergens) ? allergens : [];
  } catch (e) {
    return [];
  }
}

/**
 * Parse modifiers from JSON string
 */
function parseModifiers(modifiersJson?: string | null): string[] {
  if (!modifiersJson) return [];
  try {
    const modifiers = JSON.parse(modifiersJson);
    return Array.isArray(modifiers) ? modifiers : [];
  } catch (e) {
    return [];
  }
}

/**
 * Generate the main department ticket HTML content
 */
function generateDepartmentTicketHTML(
  order: OrderWithDetails,
  department: Department
): string {
  const orderDate = formatDate(order.createdAt ? new Date(order.createdAt) : new Date());
  const orderTime = formatTime(order.createdAt ? new Date(order.createdAt) : new Date());
  
  // Filter items for this department only
  const departmentItems = filterOrderLinesByDepartment(order, department.id);
  
  // If no items for this department, return minimal ticket
  if (departmentItems.length === 0) {
    return `
      <!DOCTYPE html>
      <html lang="it">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=80mm">
          <title>Ticket ${department.name} - Ordine #${order.orderNumber}</title>
          ${generateDepartmentTicketCSS()}
      </head>
      <body>
          <div class="department-ticket">
              <div class="ticket-header">
                  <div class="department-name">${department.name}</div>
                  <div class="ticket-time">${orderTime}</div>
              </div>
              
              <div class="order-info">
                  <div class="order-info-line">
                      <span>Ordine #:</span>
                      <span>${order.orderNumber}</span>
                  </div>
                  ${order.table ? `
                  <div class="order-info-line">
                      <span>Tavolo:</span>
                      <span>${order.table.number}</span>
                  </div>
                  ` : ''}
              </div>
              
              <div class="items-section">
                  <div style="text-align: center; font-style: italic; margin: 20px 0;">
                      Nessun articolo per questo reparto
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  }
  
  // Generate items HTML for this department
  let itemsHTML = '';
  
  departmentItems.forEach((line, index) => {
    const allergens = parseAllergens(line.menuItem.allergens);
    const modifiers = parseModifiers(line.modifiers);
    const prepTime = line.menuItem.prepTimeMinutes || 0;
    
    itemsHTML += `
      <div class="item-block">
        <div class="item-header">
          <div class="item-name">${truncateText(line.menuItem.name, 28)}</div>
          <div class="item-quantity">${line.quantity}x</div>
        </div>
        
        <div class="item-details">
          ${prepTime > 0 ? `<div class="prep-time">Tempo prep: ${prepTime} min</div>` : ''}
          
          ${line.notes ? `
          <div class="item-notes">
            📝 NOTE: ${truncateText(line.notes, 36)}
          </div>
          ` : ''}
          
          ${modifiers.length > 0 ? `
          <div class="item-modifiers">
            🔧 Modifiche: ${truncateText(modifiers.join(', '), 32)}
          </div>
          ` : ''}
          
          ${allergens.length > 0 ? `
          <div class="item-allergens">
            ⚠️ ALLERGIE: ${truncateText(allergens.join(', '), 30)}
          </div>
          ` : ''}
          
          <div style="font-size: 9px; color: #666; margin-top: 3px;">
            Status: <span class="status-indicator status-${line.status}">${line.status}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  return `
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=80mm">
        <title>Ticket ${department.name} - Ordine #${order.orderNumber}</title>
        ${generateDepartmentTicketCSS()}
    </head>
    <body>
        <div class="department-ticket">
            <!-- Header -->
            <div class="ticket-header">
                <div class="department-name">${department.name}</div>
                <div class="ticket-time">${orderTime}</div>
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
                    <span>Cameriere:</span>
                    <span>${order.waiter.firstName} ${order.waiter.lastName}</span>
                </div>
                ` : ''}
            </div>
            
            <!-- Items -->
            <div class="items-section">
                <div class="items-header">Articoli da Preparare (${departmentItems.length})</div>
                ${itemsHTML}
            </div>
            
            <!-- Footer -->
            <div class="ticket-footer">
                <div style="font-weight: bold; margin: 4px 0;">
                    Totale Articoli: ${departmentItems.reduce((sum, line) => sum + (line.quantity || 1), 0)}
                </div>
                <div class="separator">═══════════════════════════════════════</div>
                <div style="font-size: 9px; color: #666;">
                    Stampato: ${formatDate(new Date())}
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Generate department ticket HTML for thermal printer with QR code
 * Main export function
 */
export async function generateDepartmentTicket(
  order: OrderWithDetails,
  department: Department
): Promise<string> {
  return await generateDepartmentTicketHTMLWithQR(order, department);
}

/**
 * Generate department ticket HTML with QR code support
 */
async function generateDepartmentTicketHTMLWithQR(
  order: OrderWithDetails,
  department: Department
): Promise<string> {
  const orderDate = formatDate(order.createdAt ? new Date(order.createdAt) : new Date());
  const orderTime = formatTime(order.createdAt ? new Date(order.createdAt) : new Date());
  
  // Filter items for this department only
  const departmentItems = filterOrderLinesByDepartment(order, department.id);
  
  // Generate QR code for the order
  const qrCode = await generateQRCode(`Ordine: ${order.orderNumber}`);
  
  // If no items for this department, return minimal ticket
  if (departmentItems.length === 0) {
    return `
      <!DOCTYPE html>
      <html lang="it">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=80mm">
          <title>Ticket ${department.name} - Ordine #${order.orderNumber}</title>
          ${generateDepartmentTicketCSS()}
      </head>
      <body>
          <div class="department-ticket">
              <div class="ticket-header">
                  <div class="department-name">${department.name}</div>
                  <div class="ticket-time">${orderTime}</div>
              </div>
              
              <div class="order-info">
                  <div class="order-info-line">
                      <span>Ordine #:</span>
                      <span>${order.orderNumber}</span>
                  </div>
                  ${order.table ? `
                  <div class="order-info-line">
                      <span>Tavolo:</span>
                      <span>${order.table.number}</span>
                  </div>
                  ` : ''}
              </div>
              
              <div class="items-section">
                  <div style="text-align: center; font-style: italic; margin: 20px 0;">
                      Nessun articolo per questo reparto
                  </div>
              </div>
              
              ${qrCode ? `
              <div class="qr-code">
                  <img src="${qrCode}" alt="QR Code Ordine ${order.orderNumber}" style="max-width: 100px; height: auto;" />
                  <div style="font-size: 8px; margin-top: 2px;">Ordine: ${order.orderNumber}</div>
              </div>
              ` : ''}
          </div>
      </body>
      </html>
    `;
  }
  
  // Generate items HTML for this department
  let itemsHTML = '';
  
  departmentItems.forEach((line, index) => {
    const allergens = parseAllergens(line.menuItem.allergens);
    const modifiers = parseModifiers(line.modifiers);
    const prepTime = line.menuItem.prepTimeMinutes || 0;
    
    itemsHTML += `
      <div class="item-block">
        <div class="item-header">
          <div class="item-name">${truncateText(line.menuItem.name, 28)}</div>
          <div class="item-quantity">${line.quantity}x</div>
        </div>
        
        <div class="item-details">
          ${prepTime > 0 ? `<div class="prep-time">Tempo prep: ${prepTime} min</div>` : ''}
          
          ${line.notes ? `
          <div class="item-notes">
            📝 NOTE: ${truncateText(line.notes, 36)}
          </div>
          ` : ''}
          
          ${modifiers.length > 0 ? `
          <div class="item-modifiers">
            🔧 Modifiche: ${truncateText(modifiers.join(', '), 32)}
          </div>
          ` : ''}
          
          ${allergens.length > 0 ? `
          <div class="item-allergens">
            ⚠️ ALLERGIE: ${truncateText(allergens.join(', '), 30)}
          </div>
          ` : ''}
          
          <div style="font-size: 9px; color: #666; margin-top: 3px;">
            Status: <span class="status-indicator status-${line.status}">${line.status}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  return `
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=80mm">
        <title>Ticket ${department.name} - Ordine #${order.orderNumber}</title>
        ${generateDepartmentTicketCSS()}
    </head>
    <body>
        <div class="department-ticket">
            <!-- Header -->
            <div class="ticket-header">
                <div class="department-name">${department.name}</div>
                <div class="ticket-time">${orderTime}</div>
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
                    <span>Cameriere:</span>
                    <span>${order.waiter.firstName} ${order.waiter.lastName}</span>
                </div>
                ` : ''}
            </div>
            
            <!-- Items -->
            <div class="items-section">
                <div class="items-header">Articoli da Preparare (${departmentItems.length})</div>
                ${itemsHTML}
            </div>
            
            <!-- QR Code -->
            ${qrCode ? `
            <div class="qr-code">
                <img src="${qrCode}" alt="QR Code Ordine ${order.orderNumber}" style="max-width: 100px; height: auto;" />
                <div style="font-size: 8px; margin-top: 2px;">Ordine: ${order.orderNumber}</div>
            </div>
            ` : ''}
            
            <!-- Footer -->
            <div class="ticket-footer">
                <div style="font-weight: bold; margin: 4px 0;">
                    Totale Articoli: ${departmentItems.reduce((sum, line) => sum + (line.quantity || 1), 0)}
                </div>
                <div class="separator">═══════════════════════════════════════</div>
                <div style="font-size: 9px; color: #666;">
                    Stampato: ${formatDate(new Date())}
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

// Special constant for items without department
export const NO_DEPARTMENT_CODE = 'NO_DEPT';
export const NO_DEPARTMENT_NAME = 'Articoli Senza Reparto';

/**
 * Get all department IDs that have items in the given order
 * Now includes a special 'NO_DEPT' code for items without department
 */
export function getDepartmentsWithItems(order: OrderWithDetails): string[] {
  const departmentIds = new Set<string>();
  let hasNoDepartmentItems = false;
  
  order.orderLines.forEach(line => {
    if (line.menuItem.departmentId) {
      departmentIds.add(line.menuItem.departmentId);
    } else {
      hasNoDepartmentItems = true;
    }
  });
  
  const result = Array.from(departmentIds);
  
  // Add special code for items without department
  if (hasNoDepartmentItems) {
    result.push(NO_DEPARTMENT_CODE);
  }
  
  return result;
}

/**
 * Check if an order has items without department assignment
 */
export function hasItemsWithoutDepartment(order: OrderWithDetails): boolean {
  return order.orderLines.some(line => !line.menuItem.departmentId);
}

/**
 * Filter order lines to only include items without department assignment
 */
export function filterOrderLinesWithoutDepartment(order: OrderWithDetails) {
  return order.orderLines.filter(line => !line.menuItem.departmentId);
}

/**
 * Generate all department tickets for an order
 */
export function generateAllDepartmentTickets(
  order: OrderWithDetails,
  departments: Department[]
): Map<string, string> {
  const tickets = new Map<string, string>();
  const orderDepartmentIds = getDepartmentsWithItems(order);
  
  orderDepartmentIds.forEach(departmentId => {
    const department = departments.find(d => d.id === departmentId);
    if (department) {
      tickets.set(department.code, generateDepartmentTicket(order, department));
    }
  });
  
  return tickets;
}

/**
 * Generate QR code as base64 data URI
 */
async function generateQRCode(data: string): Promise<string> {
  try {
    const qrDataUri = await QRCode.toDataURL(data, {
      type: 'image/png',
      width: 150,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrDataUri;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return '';
  }
}

/**
 * Generate ticket for items without department assignment
 */
export async function generateNoDepartmentTicket(
  order: OrderWithDetails
): Promise<string> {
  const orderDate = formatDate(order.createdAt ? new Date(order.createdAt) : new Date());
  const orderTime = formatTime(order.createdAt ? new Date(order.createdAt) : new Date());
  
  // Filter items without department assignment
  const noDepartmentItems = filterOrderLinesWithoutDepartment(order);
  
  // If no items without department, return minimal ticket
  if (noDepartmentItems.length === 0) {
    const qrCode = await generateQRCode(`Ordine: ${order.orderNumber}`);
    
    return `
      <!DOCTYPE html>
      <html lang="it">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=80mm">
          <title>Ticket ${NO_DEPARTMENT_NAME} - Ordine #${order.orderNumber}</title>
          ${generateDepartmentTicketCSS()}
      </head>
      <body>
          <div class="department-ticket">
              <div class="ticket-header">
                  <div class="department-name">${NO_DEPARTMENT_NAME}</div>
                  <div class="ticket-time">${orderTime}</div>
              </div>
              
              <div class="order-info">
                  <div class="order-info-line">
                      <span>Ordine #:</span>
                      <span>${order.orderNumber}</span>
                  </div>
                  ${order.table ? `
                  <div class="order-info-line">
                      <span>Tavolo:</span>
                      <span>${order.table.number}</span>
                  </div>
                  ` : ''}
              </div>
              
              <div class="items-section">
                  <div style="text-align: center; font-style: italic; margin: 20px 0;">
                      Nessun articolo senza reparto
                  </div>
              </div>
              
              ${qrCode ? `
              <div class="qr-code">
                  <img src="${qrCode}" alt="QR Code Ordine ${order.orderNumber}" style="max-width: 100px; height: auto;" />
                  <div style="font-size: 8px; margin-top: 2px;">Ordine: ${order.orderNumber}</div>
              </div>
              ` : ''}
          </div>
      </body>
      </html>
    `;
  }
  
  // Generate items HTML for items without department
  let itemsHTML = '';
  
  noDepartmentItems.forEach((line, index) => {
    const allergens = parseAllergens(line.menuItem.allergens);
    const modifiers = parseModifiers(line.modifiers);
    const prepTime = line.menuItem.prepTimeMinutes || 0;
    
    itemsHTML += `
      <div class="item-block">
        <div class="item-header">
          <div class="item-name">${truncateText(line.menuItem.name, 28)}</div>
          <div class="item-quantity">${line.quantity}x</div>
        </div>
        
        <div class="item-details">
          ${prepTime > 0 ? `<div class="prep-time">Tempo prep: ${prepTime} min</div>` : ''}
          
          ${line.notes ? `
          <div class="item-notes">
            📝 NOTE: ${truncateText(line.notes, 36)}
          </div>
          ` : ''}
          
          ${modifiers.length > 0 ? `
          <div class="item-modifiers">
            🔧 Modifiche: ${truncateText(modifiers.join(', '), 32)}
          </div>
          ` : ''}
          
          ${allergens.length > 0 ? `
          <div class="item-allergens">
            ⚠️ ALLERGIE: ${truncateText(allergens.join(', '), 30)}
          </div>
          ` : ''}
          
          <div style="font-size: 9px; color: #666; margin-top: 3px;">
            Status: <span class="status-indicator status-${line.status}">${line.status}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  // Generate QR code for the order
  const qrCode = await generateQRCode(`Ordine: ${order.orderNumber}`);
  
  return `
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=80mm">
        <title>Ticket ${NO_DEPARTMENT_NAME} - Ordine #${order.orderNumber}</title>
        ${generateDepartmentTicketCSS()}
    </head>
    <body>
        <div class="department-ticket">
            <!-- Header -->
            <div class="ticket-header">
                <div class="department-name">${NO_DEPARTMENT_NAME}</div>
                <div class="ticket-time">${orderTime}</div>
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
                    <span>Cameriere:</span>
                    <span>${order.waiter.firstName} ${order.waiter.lastName}</span>
                </div>
                ` : ''}
            </div>
            
            <!-- Items -->
            <div class="items-section">
                <div class="items-header">Articoli da Preparare (${noDepartmentItems.length})</div>
                ${itemsHTML}
            </div>
            
            <!-- QR Code -->
            ${qrCode ? `
            <div class="qr-code">
                <img src="${qrCode}" alt="QR Code Ordine ${order.orderNumber}" style="max-width: 100px; height: auto;" />
                <div style="font-size: 8px; margin-top: 2px;">Ordine: ${order.orderNumber}</div>
            </div>
            ` : ''}
            
            <!-- Footer -->
            <div class="ticket-footer">
                <div style="font-weight: bold; margin: 4px 0;">
                    Totale Articoli: ${noDepartmentItems.reduce((sum, line) => sum + (line.quantity || 1), 0)}
                </div>
                <div class="separator">═══════════════════════════════════════</div>
                <div style="font-size: 9px; color: #666;">
                    Stampato: ${formatDate(new Date())}
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}