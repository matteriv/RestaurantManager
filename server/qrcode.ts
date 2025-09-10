// QR Code generation utility
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';

export function generateUniqueId(): string {
  return nanoid();
}

export async function generateQRCode(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data);
  } catch (error) {
    console.error('QR Code generation error:', error);
    throw new Error('Failed to generate QR code');
  }
}

export function generateReceiptQRData(orderId: string, uniqueId: string): string {
  return JSON.stringify({
    orderId,
    receiptId: uniqueId,
    timestamp: new Date().toISOString(),
    type: 'receipt'
  });
}