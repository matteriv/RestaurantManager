import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { insertOrderSchema, insertOrderLineSchema, insertPaymentSchema, insertAuditLogSchema, insertDepartmentSchema, insertSettingSchema, insertMenuItemSchema, logoSettingsSchema, LOGO_SETTING_KEYS, LogoSettingKey, insertPrinterTerminalSchema, insertPrinterDepartmentSchema, insertPrintLogSchema, insertManualPrinterSchema, paymentInfoSchema, type InsertOrderLine } from "@shared/schema";
import { z } from "zod";
import { getAvailablePrinters, clearPrinterCache, getCacheStatus } from "./printerDetection";
import os from "os";
import { generateCustomerReceiptFromSettings, type PaymentInfo } from "./receiptGenerator";
import { generateDepartmentTicket, getDepartmentsWithItems, generateNoDepartmentTicket, NO_DEPARTMENT_CODE, NO_DEPARTMENT_NAME } from "./departmentReceiptGenerator";
import { printDocument, getPrintJobStatus, cancelPrintJob, getPrinterQueue, type PrintOptions, printerNameSchema, jobIdSchema, printOptionsSchema, contentSchema, combinePrintUrls } from "./cupsInterface";
import { Socket } from "net";

interface WebSocketClient extends WebSocket {
  isAlive?: boolean;
  clientType?: 'pos' | 'kds' | 'customer' | 'admin';
}

// Global broadcast function wrapper - safe to call before WebSocket is initialized
function broadcastMessage(type: string, data: any, targetClientType?: string) {
  // Access the global broadcast function if it exists
  if ((global as any).broadcastMessage && typeof (global as any).broadcastMessage === 'function') {
    (global as any).broadcastMessage(type, data, targetClientType);
  } else {
    // Log warning if broadcast is not yet initialized
    console.warn('WebSocket broadcast not yet initialized for message:', type);
  }
}

// Helper function to test printer connectivity
async function testPrinterConnection(ipAddress: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const socket = new Socket();
    
    socket.setTimeout(3000); // 3 second timeout
    
    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve(responseTime);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
    
    socket.on('error', (err) => {
      socket.destroy();
      reject(new Error(`Connection failed: ${err.message}`));
    });
    
    socket.connect(port, ipAddress);
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let user = await storage.getUser(userId);
      
      // If user not found in database, bootstrap from session claims
      if (!user) {
        console.log('🔄 User not found in database, bootstrapping from session claims...');
        const claims = req.user.claims;
        
        // Bootstrap user from OIDC claims with proper field mapping
        const userData = {
          id: claims.sub,
          email: claims.email,
          firstName: claims.first_name || claims.firstName,
          lastName: claims.last_name || claims.lastName,
          profileImageUrl: claims.profile_image_url || claims.profileImageUrl,
          role: claims.role || 'waiter', // Default to waiter for security
        };
        
        // Create the user in the database
        user = await storage.upsertUser(userData);
        console.log('✅ User bootstrapped successfully:', user.email);
      }
      
      // Always return a valid user object, never null/undefined
      res.json(user);
    } catch (error) {
      console.error("Error fetching/bootstrapping user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Menu routes
  app.get('/api/menu/categories', async (req, res) => {
    try {
      const categories = await storage.getMenuCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching menu categories:", error);
      res.status(500).json({ message: "Failed to fetch menu categories" });
    }
  });

  app.get('/api/menu/items', async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string;
      const items = await storage.getMenuItems(categoryId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching menu items:", error);
      res.status(500).json({ message: "Failed to fetch menu items" });
    }
  });

  app.post('/api/menu/items', isAuthenticated, async (req: any, res) => {
    try {
      const itemData = insertMenuItemSchema.parse(req.body);
      const item = await storage.createMenuItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid item data", errors: error.errors });
      }
      console.error("Error creating menu item:", error);
      res.status(500).json({ message: "Failed to create menu item" });
    }
  });

  app.patch('/api/menu/items/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const itemData = req.body;
      const item = await storage.updateMenuItem(id, itemData);
      res.json(item);
    } catch (error) {
      console.error("Error updating menu item:", error);
      res.status(500).json({ message: "Failed to update menu item" });
    }
  });

  app.delete('/api/menu/items/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteMenuItem(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting menu item:", error);
      res.status(500).json({ message: "Failed to delete menu item" });
    }
  });

  // Department routes
  app.get('/api/departments', async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  app.post('/api/departments', isAuthenticated, async (req: any, res) => {
    try {
      const departmentData = insertDepartmentSchema.parse(req.body);
      const department = await storage.createDepartment(departmentData);
      res.status(201).json(department);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid department data", errors: error.errors });
      }
      console.error("Error creating department:", error);
      res.status(500).json({ message: "Failed to create department" });
    }
  });

  app.patch('/api/departments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const departmentData = req.body;
      const department = await storage.updateDepartment(id, departmentData);
      res.json(department);
    } catch (error) {
      console.error("Error updating department:", error);
      res.status(500).json({ message: "Failed to update department" });
    }
  });

  app.delete('/api/departments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteDepartment(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting department:", error);
      res.status(500).json({ message: "Failed to delete department" });
    }
  });

  // Settings routes
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // Logo settings routes (must come before generic :key route)
  app.get('/api/settings/logo', async (req, res) => {
    try {
      const logoSettings = await storage.getLogoSettings();
      res.json(logoSettings);
    } catch (error) {
      console.error("Error fetching logo settings:", error);
      res.status(500).json({ message: "Failed to fetch logo settings" });
    }
  });

  app.post('/api/settings/logo', isAdmin, async (req: any, res) => {
    try {
      const logoData = logoSettingsSchema.parse(req.body);
      const logoSettings = await storage.updateLogoSettings(logoData);
      res.json(logoSettings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid logo settings data", errors: error.errors });
      }
      console.error("Error updating logo settings:", error);
      res.status(500).json({ message: "Failed to update logo settings" });
    }
  });

  app.get('/api/settings/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await storage.getSetting(key);
      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      console.error("Error fetching setting:", error);
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  app.put('/api/settings', isAuthenticated, async (req: any, res) => {
    try {
      const settingData = insertSettingSchema.parse(req.body);
      
      // Security check: Protect logo setting keys - require admin privileges
      const logoSettingValues = Object.values(LOGO_SETTING_KEYS);
      if (logoSettingValues.includes(settingData.key as LogoSettingKey)) {
        // Check if user has admin role
        const userId = req.user.claims.sub;
        const user = await storage.getUser(userId);
        
        if (!user || user.role !== 'admin') {
          return res.status(403).json({ 
            message: "Admin privileges required to modify logo settings. Please use the POST /api/settings/logo endpoint instead.", 
            errorCode: "LOGO_SETTINGS_ADMIN_REQUIRED" 
          });
        }
      }
      
      const setting = await storage.upsertSetting(settingData);
      res.json(setting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid setting data", errors: error.errors });
      }
      console.error("Error upserting setting:", error);
      res.status(500).json({ message: "Failed to upsert setting" });
    }
  });

  // Table routes
  app.get('/api/tables', async (req, res) => {
    try {
      const tables = await storage.getTables();
      res.json(tables);
    } catch (error) {
      console.error("Error fetching tables:", error);
      res.status(500).json({ message: "Failed to fetch tables" });
    }
  });

  app.get('/api/tables/with-orders', async (req, res) => {
    try {
      const tables = await storage.getTablesWithOrders();
      res.json(tables);
    } catch (error) {
      console.error("Error fetching tables with orders:", error);
      res.status(500).json({ message: "Failed to fetch tables with orders" });
    }
  });

  app.patch('/api/tables/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const table = await storage.updateTableStatus(id, status);
      
      // Broadcast table status update
      broadcastMessage('table-status-updated', { table });
      
      res.json(table);
    } catch (error) {
      console.error("Error updating table status:", error);
      res.status(500).json({ message: "Failed to update table status" });
    }
  });

  // Order routes
  app.get('/api/orders', async (req, res) => {
    try {
      const status = req.query.status as string;
      const orders = await storage.getOrders(status);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get('/api/orders/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.post('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const orderData = insertOrderSchema.parse(req.body);
      const userId = req.user.claims.sub;
      
      const order = await storage.createOrder({
        ...orderData,
        waiterId: userId,
      });

      // Update inventory for tracked items
      if (orderData.orderLines && orderData.orderLines.length > 0) {
        for (const orderLine of orderData.orderLines) {
          try {
            // Get menu item details
            const menuItem = await storage.getMenuItem(orderLine.menuItemId);
            
            // If inventory tracking is enabled, decrement stock
            if (menuItem && menuItem.trackInventory && menuItem.currentStock !== null) {
              const newStock = Math.max(0, (menuItem.currentStock || 0) - (orderLine.quantity || 1));
              await storage.updateMenuItem(orderLine.menuItemId, {
                currentStock: newStock
              });
            }
          } catch (inventoryError) {
            console.error(`Error updating inventory for item ${orderLine.menuItemId}:`, inventoryError);
            // Continue processing other items even if one fails
          }
        }
      }

      // Create audit log
      await storage.createAuditLog({
        userId,
        action: 'create_order',
        entityType: 'order',
        entityId: order.id,
        newValues: order,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Broadcast new order to kitchen displays
      broadcastMessage('new-order', { order });
      
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.patch('/api/orders/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.claims.sub;
      
      const oldOrder = await storage.getOrder(id);
      const order = await storage.updateOrderStatus(id, status);

      // Handle inventory restoration when order is cancelled
      if (status === 'cancelled' && oldOrder?.status !== 'cancelled' && oldOrder?.orderLines && oldOrder.orderLines.length > 0) {
        for (const orderLine of oldOrder.orderLines) {
          try {
            // Get menu item details
            const menuItem = await storage.getMenuItem(orderLine.menuItemId);
            
            // If inventory tracking is enabled, restore stock
            if (menuItem && menuItem.trackInventory && menuItem.currentStock !== null) {
              const restoredStock = (menuItem.currentStock || 0) + (orderLine.quantity || 1);
              await storage.updateMenuItem(orderLine.menuItemId, {
                currentStock: restoredStock
              });
            }
          } catch (inventoryError) {
            console.error(`Error restoring inventory for cancelled order item ${orderLine.menuItemId}:`, inventoryError);
            // Continue processing other items even if one fails
          }
        }
      }

      // Create audit log
      await storage.createAuditLog({
        userId,
        action: 'update_order_status',
        entityType: 'order',
        entityId: order.id,
        oldValues: { status: oldOrder?.status },
        newValues: { status: order.status },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Broadcast order status update
      broadcastMessage('order-status-updated', { order });
      
      res.json(order);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Order line routes
  app.post('/api/order-lines', isAuthenticated, async (req: any, res) => {
    try {
      const orderLineData = insertOrderLineSchema.extend({ orderId: z.string() }).parse(req.body);
      const orderLine = await storage.createOrderLine(orderLineData);
      
      // Broadcast new order line to kitchen displays
      broadcastMessage('new-order-line', { orderLine });
      
      res.status(201).json(orderLine);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order line data", errors: error.errors });
      }
      console.error("Error creating order line:", error);
      res.status(500).json({ message: "Failed to create order line" });
    }
  });

  app.patch('/api/order-lines/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const orderLine = await storage.updateOrderLineStatus(id, status);
      
      // Broadcast order line status update
      broadcastMessage('order-line-status-updated', { orderLine });
      
      res.json(orderLine);
    } catch (error) {
      console.error("Error updating order line status:", error);
      res.status(500).json({ message: "Failed to update order line status" });
    }
  });

  app.delete('/api/order-lines/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Get order line details before deletion for inventory restoration
      const orderLine = await storage.getOrderLine(id);
      
      await storage.deleteOrderLine(id);

      // Restore inventory if item tracking is enabled
      if (orderLine && orderLine.menuItemId) {
        try {
          const menuItem = await storage.getMenuItem(orderLine.menuItemId);
          
          if (menuItem && menuItem.trackInventory && menuItem.currentStock !== null) {
            const restoredStock = (menuItem.currentStock || 0) + (orderLine.quantity || 1);
            await storage.updateMenuItem(orderLine.menuItemId, {
              currentStock: restoredStock
            });
          }
        } catch (inventoryError) {
          console.error(`Error restoring inventory for deleted order line ${id}:`, inventoryError);
          // Continue processing even if inventory update fails
        }
      }

      // Create audit log
      await storage.createAuditLog({
        userId,
        action: 'delete_order_line',
        entityType: 'order_line',
        entityId: id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Broadcast order line deletion
      broadcastMessage('order-line-deleted', { orderLineId: id });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting order line:", error);
      res.status(500).json({ message: "Failed to delete order line" });
    }
  });

  // Payment routes
  app.post('/api/payments', isAuthenticated, async (req: any, res) => {
    try {
      const paymentData = insertPaymentSchema.parse(req.body);
      const userId = req.user.claims.sub;
      
      const payment = await storage.createPayment({
        ...paymentData,
        processedBy: userId,
      });

      // Update order status to paid
      await storage.updateOrderStatus(paymentData.orderId, 'paid');

      // Create audit log
      await storage.createAuditLog({
        userId,
        action: 'create_payment',
        entityType: 'payment',
        entityId: payment.id,
        newValues: payment,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Broadcast payment completion
      broadcastMessage('payment-completed', { payment });
      
      // Get order with full details to determine departments with items
      const orderWithDetails = await storage.getOrder(paymentData.orderId);
      
      // Include receipt generation URLs in response
      const receiptUrls = {
        printable: `/api/receipts/customer/${paymentData.orderId}`,
        printablePost: `/api/receipts/customer/${paymentData.orderId}` // for POST with custom payment data
      };
      
      // Generate department receipt URLs
      let departmentReceiptUrls: Record<string, string> = {};
      if (orderWithDetails) {
        try {
          console.log("🐛 [PAYMENT DEBUG] OrderWithDetails found, orderLines count:", orderWithDetails.orderLines?.length || 0);
          
          // Debug: Log menu items and their departmentId
          orderWithDetails.orderLines?.forEach((line, index) => {
            console.log(`🐛 [PAYMENT DEBUG] OrderLine ${index}: menuItem.name="${line.menuItem?.name}", departmentId="${line.menuItem?.departmentId}"`);
          });
          
          const departmentIds = getDepartmentsWithItems(orderWithDetails);
          console.log("🐛 [PAYMENT DEBUG] getDepartmentsWithItems returned:", departmentIds);
          
          const departments = await storage.getDepartments();
          console.log("🐛 [PAYMENT DEBUG] Available departments:", departments.map(d => ({ id: d.id, code: d.code, name: d.name })));
          
          departmentReceiptUrls = departmentIds.reduce((urls, departmentId) => {
            if (departmentId === NO_DEPARTMENT_CODE) {
              // Special case for items without department
              urls[NO_DEPARTMENT_CODE] = `/api/receipts/department/${paymentData.orderId}/${NO_DEPARTMENT_CODE}`;
              console.log("🐛 [PAYMENT DEBUG] Added NO_DEPARTMENT URL");
            } else {
              const department = departments.find(d => d.id === departmentId);
              if (department) {
                urls[department.code] = `/api/receipts/department/${paymentData.orderId}/${department.code}`;
                console.log(`🐛 [PAYMENT DEBUG] Added department URL for: ${department.code}`);
              } else {
                console.log(`🐛 [PAYMENT DEBUG] Department not found for ID: ${departmentId}`);
              }
            }
            return urls;
          }, {} as Record<string, string>);
          
          console.log("🐛 [PAYMENT DEBUG] Final departmentReceiptUrls:", departmentReceiptUrls);
        } catch (error) {
          console.error("Error generating department receipt URLs:", error);
          // Continue without department URLs if there's an error
        }
      } else {
        console.log("🐛 [PAYMENT DEBUG] No orderWithDetails found!");
      }
      
      res.status(201).json({
        ...payment,
        receiptUrls,
        departmentReceiptUrls,
        receiptReady: true
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payment data", errors: error.errors });
      }
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // Receipt generation routes - SECURED WITH AUTHENTICATION AND AUTHORIZATION
  app.get('/api/receipts/customer/:orderId', isAuthenticated, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      
      // Get current user for authorization check
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Get order with full details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // AUTHORIZATION CHECK: Only admin/manager or assigned waiter can access order receipts
      const hasAccess = currentUser.role === 'admin' || 
                       currentUser.role === 'manager' || 
                       order.waiterId === userId;
      
      if (!hasAccess) {
        return res.status(403).json({ 
          message: "Access denied. You can only access receipts for your own orders.",
          errorCode: "RECEIPT_ACCESS_DENIED" 
        });
      }

      // Get restaurant settings for receipt header
      const settings = await storage.getSettings();
      
      // Get payment information from the order's payments - SECURED PROCESSING
      let paymentInfo: PaymentInfo;
      if (order.payments && order.payments.length > 0) {
        const payment = order.payments[0]; // Take the first payment
        paymentInfo = {
          method: payment.method === 'cash' ? 'Contante' : 
                 payment.method === 'card' ? 'Carta' : 
                 payment.method === 'split' ? 'Misto' : payment.method,
          amount: parseFloat(payment.amount.toString()),
          // Add received and change for cash payments if available
          ...(payment.method === 'cash' && {
            received: parseFloat(payment.amount.toString()),
            change: 0
          })
        };
      } else {
        // Default payment info if no payment records exist yet
        paymentInfo = {
          method: 'In attesa',
          amount: parseFloat(order.total?.toString() || '0')
        };
      }

      // Generate receipt HTML
      const receiptHTML = await generateCustomerReceiptFromSettings(order, settings, paymentInfo);

      // Set appropriate headers for HTML response
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      
      res.send(receiptHTML);
    } catch (error) {
      console.error("Error generating customer receipt:", error);
      res.status(500).json({ message: "Failed to generate receipt" });
    }
  });

  // Receipt generation for payment flow (with payment data) - SECURED WITH AUTH AND VALIDATION
  app.post('/api/receipts/customer/:orderId', isAuthenticated, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      
      // Get current user for authorization check
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Validate payment data with Zod schema to prevent injection
      const validatedPaymentData = paymentInfoSchema.parse(req.body);
      
      // Get order with full details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // AUTHORIZATION CHECK: Only admin/manager or assigned waiter can generate receipts
      const hasAccess = currentUser.role === 'admin' || 
                       currentUser.role === 'manager' || 
                       order.waiterId === userId;
      
      if (!hasAccess) {
        return res.status(403).json({ 
          message: "Access denied. You can only generate receipts for your own orders.",
          errorCode: "RECEIPT_ACCESS_DENIED" 
        });
      }

      // Get restaurant settings for receipt header
      const settings = await storage.getSettings();
      
      // Prepare payment info from VALIDATED request body - SECURE AGAINST INJECTION
      const paymentInfo: PaymentInfo = {
        method: validatedPaymentData.method, // Already transformed by schema
        amount: validatedPaymentData.amount,
        received: validatedPaymentData.received,
        change: validatedPaymentData.change,
        transactionId: validatedPaymentData.transactionId
      };

      // Generate receipt HTML
      const receiptHTML = await generateCustomerReceiptFromSettings(order, settings, paymentInfo);

      // Return HTML for printing
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      
      res.send(receiptHTML);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid payment data - potential security threat blocked", 
          errors: error.errors,
          errorCode: "PAYMENT_VALIDATION_FAILED" 
        });
      }
      console.error("Error generating customer receipt with payment data:", error);
      res.status(500).json({ message: "Failed to generate receipt" });
    }
  });

  // Department ticket generation - SECURED WITH AUTH AND VALIDATION
  app.get('/api/receipts/department/:orderId/:departmentCode', isAuthenticated, async (req: any, res) => {
    try {
      const { orderId, departmentCode } = req.params;
      
      // Get current user for authorization check
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Get order with full details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // AUTHORIZATION CHECK: Only admin/manager or assigned waiter can access order tickets
      const hasAccess = currentUser.role === 'admin' || 
                       currentUser.role === 'manager' || 
                       order.waiterId === userId;
      
      if (!hasAccess) {
        return res.status(403).json({ 
          message: "Access denied. You can only access tickets for your own orders.",
          errorCode: "TICKET_ACCESS_DENIED" 
        });
      }

      // Handle special case for no-department items
      if (departmentCode === NO_DEPARTMENT_CODE) {
        // Generate no-department ticket HTML
        const ticketHTML = await generateNoDepartmentTicket(order);
        
        // Set appropriate headers for HTML response
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        
        res.send(ticketHTML);
        return;
      }

      // Get department information for regular departments
      const departments = await storage.getDepartments();
      const department = departments.find(d => d.code === departmentCode);
      
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }

      // Check if department is active
      if (!department.isActive) {
        return res.status(400).json({ message: "Department is not active" });
      }

      // Generate department ticket HTML
      const ticketHTML = await generateDepartmentTicket(order, department);

      // Set appropriate headers for HTML response
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      
      res.send(ticketHTML);
    } catch (error) {
      console.error("Error generating department ticket:", error);
      res.status(500).json({ message: "Failed to generate department ticket" });
    }
  });

  // Analytics routes
  app.get('/api/analytics/daily-sales', async (req, res) => {
    try {
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const sales = await storage.getDailySales(date);
      res.json(sales);
    } catch (error) {
      console.error("Error fetching daily sales:", error);
      res.status(500).json({ message: "Failed to fetch daily sales" });
    }
  });

  app.get('/api/analytics/top-dishes', async (req, res) => {
    try {
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const topDishes = await storage.getTopDishes(date, limit);
      res.json(topDishes);
    } catch (error) {
      console.error("Error fetching top dishes:", error);
      res.status(500).json({ message: "Failed to fetch top dishes" });
    }
  });

  app.get('/api/analytics/kitchen-performance', async (req, res) => {
    try {
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const performance = await storage.getKitchenPerformance(date);
      res.json(performance);
    } catch (error) {
      console.error("Error fetching kitchen performance:", error);
      res.status(500).json({ message: "Failed to fetch kitchen performance" });
    }
  });

  // Define payment processing schema
  const paymentProcessSchema = z.object({
    tableId: z.string().optional(),
    orderItems: z.array(z.object({
      menuItemId: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.string(),
      totalPrice: z.string(),
      notes: z.string().optional(),
    })),
    total: z.string(),
    notes: z.string().optional(),
    receiptMethod: z.literal('print'),
  });

  // Payment processing endpoint
  app.post('/api/payments/process', isAuthenticated, async (req: any, res) => {
    try {
      console.log('💳 Payment processing started:', {
        timestamp: new Date().toISOString(),
        userId: req.user?.claims?.sub,
        requestBody: {
          itemCount: req.body.orderItems?.length || 0,
          total: req.body.total,
          tableId: req.body.tableId,
          receiptMethod: req.body.receiptMethod
        }
      });
      
      const validatedData = paymentProcessSchema.parse(req.body);
      const { tableId, orderItems, total, notes, receiptMethod } = validatedData;
      const userId = req.user.claims.sub;
      
      console.log('✅ Payment data validated successfully:', {
        itemCount: orderItems.length,
        total: total,
        tableId: tableId || 'no table',
        userId: userId
      });
      
      // Create order first
      const orderNumber = await storage.getNextOrderNumber();
      const order = await storage.createOrder({
        tableId: tableId || null,
        subtotal: total,
        tax: '0',
        total,
        status: 'new',
        notes: notes || null,
        waiterId: userId,
      });

      // Create order lines
      for (const item of orderItems) {
        await storage.createOrderLine({
          orderId: order.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          notes: item.notes || '',
          status: 'new',
        });
      }

      // Update table status to occupied if not already
      if (tableId) {
        await storage.updateTableStatus(tableId, 'occupied');
      }

      // Generate unique receipt ID and QR code
      const { generateUniqueId, generateQRCode, generateReceiptQRData } = await import('./qrcode');
      const receiptId = generateUniqueId();
      const qrData = generateReceiptQRData(order.id, receiptId);
      const qrCodeDataUrl = await generateQRCode(qrData);

      // Create payment record
      await storage.createPayment({
        orderId: order.id,
        amount: total,
        method: 'cash',
        processedBy: userId,
        receiptId,
        qrCode: qrCodeDataUrl,
        receiptMethod: 'print',
        customerEmail: null,
        customerPhone: null,
      });

      // Receipt printing handled by frontend
      console.log(`Print receipt requested for Order #${orderNumber} - Receipt ID: ${receiptId}`);

      // Broadcast order update
      broadcastMessage('new-order', { order: { ...order, orderLines: [] } });
      
      // Broadcast daily sales update for real-time POS totals
      broadcastMessage('daily-sales-updated', { 
        date: new Date().toISOString().split('T')[0],
        message: 'Payment processed - sales data updated'
      }, 'pos');
      
      // Get order with full details to determine departments with items
      const orderWithDetails = await storage.getOrder(order.id);
      
      console.log('🔍 DEBUG: Order with details retrieved:', {
        orderId: order.id,
        orderWithDetails: orderWithDetails ? 'EXISTS' : 'NULL/UNDEFINED',
        orderLinesCount: orderWithDetails?.orderLines?.length || 0
      });
      
      // Include receipt generation URLs in response
      const receiptUrls = {
        printable: `/api/receipts/customer/${order.id}`,
        printablePost: `/api/receipts/customer/${order.id}` // for POST with custom payment data
      };
      
      // Generate department receipt URLs
      let departmentReceiptUrls: Record<string, string> = {};
      if (orderWithDetails) {
        try {
          // Debug: Log order lines and their menu items
          console.log('🔍 DEBUG: Order lines details:', 
            orderWithDetails.orderLines.map(line => ({
              itemId: line.menuItemId,
              itemName: line.menuItem?.name || 'UNKNOWN',
              departmentId: line.menuItem?.departmentId || 'NULL'
            }))
          );
          
          const departmentIds = getDepartmentsWithItems(orderWithDetails);
          console.log('🔍 DEBUG: Department IDs found:', departmentIds);
          
          const departments = await storage.getDepartments();
          console.log('🔍 DEBUG: Available departments:', 
            departments.map(d => ({ id: d.id, name: d.name, code: d.code }))
          );
          
          departmentReceiptUrls = departmentIds.reduce((urls, departmentId) => {
            console.log('🔍 DEBUG: Processing department ID:', departmentId);
            
            if (departmentId === NO_DEPARTMENT_CODE) {
              // Special case for items without department
              urls[NO_DEPARTMENT_CODE] = `/api/receipts/department/${order.id}/${NO_DEPARTMENT_CODE}`;
              console.log('🔍 DEBUG: Added NO_DEPARTMENT URL:', urls[NO_DEPARTMENT_CODE]);
            } else {
              const department = departments.find(d => d.id === departmentId);
              if (department) {
                urls[department.code] = `/api/receipts/department/${order.id}/${department.code}`;
                console.log('🔍 DEBUG: Added department URL:', {
                  code: department.code,
                  url: urls[department.code]
                });
              } else {
                console.log('⚠️ DEBUG: Department not found for ID:', departmentId);
              }
            }
            return urls;
          }, {} as Record<string, string>);
          
          console.log('🔍 DEBUG: Final department receipt URLs:', departmentReceiptUrls);
          
        } catch (error) {
          console.error("❌ ERROR generating department receipt URLs:", error);
          console.error("❌ ERROR stack:", error instanceof Error ? error.stack : 'No stack available');
          // Continue without department URLs if there's an error
        }
      } else {
        console.log('⚠️ DEBUG: orderWithDetails is null/undefined - cannot generate department URLs');
      }
      
      res.json({ 
        message: 'Payment processed successfully - receipt ready for printing',
        orderId: order.id,
        orderNumber,
        receiptId,
        qrCode: qrCodeDataUrl,
        receiptMethod: 'print',
        receiptUrls,
        departmentReceiptUrls,
        receiptReady: true
      });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // Admin operations
  app.post('/api/admin/reset-system', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Log the critical operation first
      await storage.createAuditLog({
        userId,
        action: 'system_reset',
        entityType: 'system',
        entityId: 'system',
        newValues: { resetAt: new Date() },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Perform system reset
      const result = await storage.resetSystem();
      
      // Broadcast system reset to all connected clients
      broadcastMessage('system-reset', { resetBy: userId, timestamp: new Date() });
      
      res.json({ 
        message: 'System reset completed successfully',
        ...result 
      });
    } catch (error) {
      console.error("Error resetting system:", error);
      res.status(500).json({ message: "Failed to reset system" });
    }
  });

  // Printer Terminal Configuration routes - SECURE IMPLEMENTATION
  app.get('/api/printers/terminals', isAuthenticated, async (req: any, res) => {
    try {
      const posTerminalId = req.query.posTerminalId as string;
      
      // Security: Validate posTerminalId parameter
      if (posTerminalId) {
        const terminalIdValidation = z.string().min(1).max(255).regex(/^[a-zA-Z0-9_\-\.]+$/).safeParse(posTerminalId);
        if (!terminalIdValidation.success) {
          return res.status(400).json({ 
            message: "Invalid POS terminal ID format",
            errors: terminalIdValidation.error.errors
          });
        }
      }
      
      const printerTerminals = await storage.getPrinterTerminals(posTerminalId);
      res.json(printerTerminals);
    } catch (error) {
      console.error("Error fetching printer terminals:", error);
      res.status(500).json({ message: "Failed to fetch printer terminals" });
    }
  });

  app.post('/api/printers/terminals', isAuthenticated, async (req: any, res) => {
    try {
      // Security: Enhanced validation for printer terminal data
      const printerTerminalData = insertPrinterTerminalSchema.parse(req.body);
      
      // Security: Additional validation for printer name if present
      if (printerTerminalData.printerName) {
        const printerNameValidation = printerNameSchema.safeParse(printerTerminalData.printerName);
        if (!printerNameValidation.success) {
          return res.status(400).json({ 
            message: "Invalid printer name format", 
            errors: printerNameValidation.error.errors 
          });
        }
      }
      const printerTerminal = await storage.createPrinterTerminal(printerTerminalData);
      res.status(201).json(printerTerminal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid printer terminal data", errors: error.errors });
      }
      console.error("Error creating printer terminal:", error);
      res.status(500).json({ message: "Failed to create printer terminal" });
    }
  });

  app.put('/api/printers/terminals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const printerTerminalData = req.body;
      const printerTerminal = await storage.updatePrinterTerminal(id, printerTerminalData);
      res.json(printerTerminal);
    } catch (error) {
      console.error("Error updating printer terminal:", error);
      res.status(500).json({ message: "Failed to update printer terminal" });
    }
  });

  app.delete('/api/printers/terminals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deletePrinterTerminal(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting printer terminal:", error);
      res.status(500).json({ message: "Failed to delete printer terminal" });
    }
  });

  // Printer Department Configuration routes
  app.get('/api/printers/departments', isAuthenticated, async (req: any, res) => {
    try {
      const printerDepartments = await storage.getPrinterDepartments();
      res.json(printerDepartments);
    } catch (error) {
      console.error("Error fetching printer departments:", error);
      res.status(500).json({ message: "Failed to fetch printer departments" });
    }
  });

  app.post('/api/printers/departments', isAuthenticated, async (req: any, res) => {
    try {
      const printerDepartmentData = insertPrinterDepartmentSchema.parse(req.body);
      const printerDepartment = await storage.createPrinterDepartment(printerDepartmentData);
      res.status(201).json(printerDepartment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid printer department data", errors: error.errors });
      }
      console.error("Error creating printer department:", error);
      res.status(500).json({ message: "Failed to create printer department" });
    }
  });

  app.put('/api/printers/departments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const printerDepartmentData = req.body;
      const printerDepartment = await storage.updatePrinterDepartment(id, printerDepartmentData);
      res.json(printerDepartment);
    } catch (error) {
      console.error("Error updating printer department:", error);
      res.status(500).json({ message: "Failed to update printer department" });
    }
  });

  app.delete('/api/printers/departments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deletePrinterDepartment(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting printer department:", error);
      res.status(500).json({ message: "Failed to delete printer department" });
    }
  });

  // Available Printers Discovery route (Real OS-level detection)
  app.get('/api/printers/available', isAuthenticated, async (req: any, res) => {
    try {
      const printers = await getAvailablePrinters();
      
      // Add debug info when requested
      if (req.query.debug === 'true') {
        const cacheStatus = getCacheStatus();
        res.json({
          printers,
          debug: {
            platform: os.platform(),
            cache: cacheStatus,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        res.json(printers);
      }
    } catch (error) {
      console.error("Error fetching available printers:", error);
      res.status(500).json({ message: "Failed to fetch available printers" });
    }
  });

  // Clear printer cache endpoint (for debugging and refresh)
  app.post('/api/printers/refresh', isAuthenticated, async (req: any, res) => {
    try {
      clearPrinterCache();
      const printers = await getAvailablePrinters();
      res.json({ 
        message: "Printer cache cleared and refreshed", 
        printers,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error refreshing printers:", error);
      res.status(500).json({ message: "Failed to refresh printers" });
    }
  });

  // Manual Printer Configuration routes
  app.get('/api/printers/manual', isAuthenticated, async (req: any, res) => {
    try {
      const manualPrinters = await storage.getManualPrinters();
      res.json(manualPrinters);
    } catch (error) {
      console.error("Error fetching manual printers:", error);
      res.status(500).json({ message: "Failed to fetch manual printers" });
    }
  });

  app.post('/api/printers/manual', isAuthenticated, async (req: any, res) => {
    try {
      const manualPrinterData = insertManualPrinterSchema.parse(req.body);
      
      // Check if updating existing printer
      if (req.body.id) {
        const updated = await storage.updateManualPrinter(req.body.id, manualPrinterData);
        res.json(updated);
      } else {
        const created = await storage.createManualPrinter(manualPrinterData);
        res.status(201).json(created);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid printer configuration", 
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }
      console.error("Error managing manual printer:", error);
      res.status(500).json({ message: "Failed to save manual printer" });
    }
  });

  app.delete('/api/printers/manual/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteManualPrinter(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting manual printer:", error);
      res.status(500).json({ message: "Failed to delete manual printer" });
    }
  });

  // Test manual printer connectivity
  app.post('/api/printers/test', isAuthenticated, async (req: any, res) => {
    try {
      const { ipAddress, port, protocol } = req.body;
      
      // Security: Validate request body
      const testSchema = z.object({
        ipAddress: z.string().ip({ version: "v4" }).refine((ip) => {
          // Validate RFC1918 private IP ranges only
          const octets = ip.split('.').map(Number);
          if (octets[0] === 192 && octets[1] === 168) return true; // 192.168.0.0/16
          if (octets[0] === 10) return true; // 10.0.0.0/8
          if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true; // 172.16.0.0/12
          return false;
        }, "IP address must be in a private RFC1918 range"),
        port: z.number().int().refine((port) => [9100, 631, 515].includes(port), "Invalid port"),
        protocol: z.enum(['raw9100', 'ipp'])
      });
      
      const validatedData = testSchema.parse({ ipAddress, port, protocol });
      
      // Test printer connectivity with timeout
      const testResult = await Promise.race([
        testPrinterConnection(validatedData.ipAddress, validatedData.port),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 3000))
      ]);
      
      res.json({
        success: true,
        status: 'online',
        message: `Printer at ${validatedData.ipAddress}:${validatedData.port} is reachable`,
        responseTime: testResult
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid test parameters", 
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }
      
      console.warn(`Printer test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.json({
        success: false,
        status: 'offline',
        message: (error instanceof Error && error.message.includes('timeout')) ? 'Connection timeout (3s)' : 'Connection failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Print Logging routes
  app.post('/api/printers/logs', isAuthenticated, async (req: any, res) => {
    try {
      const printLogData = insertPrintLogSchema.parse(req.body);
      const printLog = await storage.createPrintLog(printLogData);
      res.status(201).json(printLog);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid print log data", errors: error.errors });
      }
      console.error("Error creating print log:", error);
      res.status(500).json({ message: "Failed to create print log" });
    }
  });

  app.get('/api/printers/logs', isAuthenticated, async (req: any, res) => {
    try {
      const filters: { orderId?: string; status?: string; startDate?: Date; endDate?: Date } = {};
      
      if (req.query.orderId) {
        filters.orderId = req.query.orderId as string;
      }
      
      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }
      
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }

      const printLogs = await storage.getPrintLogs(filters);
      res.json(printLogs);
    } catch (error) {
      console.error("Error fetching print logs:", error);
      res.status(500).json({ message: "Failed to fetch print logs" });
    }
  });

  // Print Spool endpoint - Returns print jobs in a standardized format
  app.get('/api/print/spool', isAuthenticated, async (req: any, res) => {
    try {
      // Get all print logs from the database
      const printLogs = await storage.getPrintLogs();
      
      // Get departments for mapping department codes
      const departments = await storage.getDepartments();
      const departmentMap = new Map(departments.map(d => [d.id, d]));
      
      // Transform print logs into the expected spool format
      const spoolJobs = printLogs.map(log => {
        // Determine document type based on printType
        let documentType = 'unknown';
        let departmentCode = null;
        let priority = 3; // Default lowest priority
        
        if (log.printType === 'customer_receipt') {
          documentType = 'customer_receipt';
          priority = 1; // Highest priority for customer receipts
        } else if (log.printType === 'department_ticket') {
          documentType = 'department_ticket';
          priority = 2; // Medium priority for department tickets
          
          // Get department code if departmentId is available
          if (log.departmentId) {
            const dept = departmentMap.get(log.departmentId);
            if (dept) {
              // Use the department code (e.g., '001' for Cucina, '002' for Cocktail)
              departmentCode = dept.code;
            }
          }
        } else if (log.printType === 'test_page') {
          documentType = 'test_page';
          priority = 3;
        }
        
        return {
          jobId: log.id,
          documentType: documentType,
          departmentCode: departmentCode,
          status: log.status || 'pending',
          priority: priority,
          timestamp: log.createdAt || new Date().toISOString(),
          orderId: log.orderId || null,
          // Additional fields for debugging
          targetPrinter: log.targetPrinter,
          attempts: log.attempts || 0,
          errorMessage: log.errorMessage || null,
        };
      });
      
      // Sort by priority (ascending) and timestamp (descending)
      spoolJobs.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority; // Lower priority number = higher priority
        }
        // If same priority, sort by timestamp (newer first)
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      res.json(spoolJobs);
    } catch (error) {
      console.error("Error fetching print spool:", error);
      // Always return JSON even on error
      res.status(500).json({ 
        error: "Failed to fetch print spool",
        message: error instanceof Error ? error.message : "Unknown error",
        jobs: [] // Return empty array on error
      });
    }
  });

  // Direct printing API for physical printers
  app.post('/api/print/direct', isAuthenticated, async (req: any, res) => {
    try {
      console.log('🖨️ Print API request body:', JSON.stringify(req.body, null, 2));
      
      // Support multiple parameter names for flexibility
      const url = req.body.url || req.body.content;
      const printerName = req.body.printerName || req.body.printer;
      const copies = req.body.copies || 1;
      const silent = req.body.silent !== false; // Default to true
      const userId = req.user?.claims?.sub || 'unknown';

      console.log(`🖨️ Direct print request: ${url} to printer: ${printerName} (copies: ${copies})`);

      if (!url) {
        console.log('❌ Print API error: URL/content is required');
        return res.status(400).json({ 
          success: false, 
          error: "URL or content is required for printing",
          received: { url, printerName, copies, body: req.body }
        });
      }

      if (!printerName) {
        console.log('❌ Print API error: Printer name is required');
        return res.status(400).json({ 
          success: false, 
          error: "Printer name is required",
          received: { url, printerName, copies, body: req.body }
        });
      }

      // Extract print options from request body
      const printOptions: PrintOptions = {
        copies,
        silent,
        pageSize: req.body.pageSize,
        orientation: req.body.orientation,
        colorMode: req.body.colorMode,
        duplex: req.body.duplex,
        quality: req.body.quality,
        mediaType: req.body.mediaType
      };

      // Log the print request
      try {
        await storage.createPrintLog({
          printType: 'receipt',
          targetPrinter: printerName,
          content: url,
          status: 'pending',
          printedAt: new Date(),
        });
      } catch (logError) {
        console.warn('Failed to log print request:', logError);
      }

      // Use real physical printing via CUPS
      console.log(`🖨️ Attempting physical print with options:`, printOptions);
      
      const printResult = await printDocument(printerName, url, printOptions);
      
      console.log(`${printResult.success ? '✅' : '❌'} Print job result:`, printResult);

      // Log print completion (success or failure)
      try {
        await storage.createPrintLog({
          printType: 'receipt',
          targetPrinter: printerName,
          content: url,
          status: printResult.success ? 'success' : 'failed',
          printedAt: new Date(),
        });
      } catch (logError) {
        console.warn('Failed to log print completion:', logError);
      }

      // Return result with appropriate status code
      const statusCode = printResult.success ? 200 : 500;
      res.status(statusCode).json(printResult);

    } catch (error) {
      console.error('❌ Direct print error:', error);
      
      // Log failed print
      try {
        const { url, printerName, copies = 1 } = req.body;
        const userId = req.user?.claims?.sub || 'unknown';
        
        await storage.createPrintLog({
          printType: 'receipt',
          targetPrinter: printerName || 'unknown',
          content: url || 'unknown',
          status: 'failed',
          printedAt: new Date(),
        });
      } catch (logError) {
        console.warn('Failed to log print error:', logError);
      }

      const errorMessage = error instanceof Error ? error.message : 'Print job failed';
      res.status(500).json({ 
        success: false, 
        error: errorMessage,
        printerName: req.body.printerName || 'unknown',
        copies: req.body.copies || 1,
        timestamp: new Date().toISOString(),
        fallbackToBrowser: true // Suggest fallback to browser printing
      });
    }
  });

  // Batch print endpoint for sequential printing (multiple pages in single job)
  app.post('/api/print/batch', isAuthenticated, async (req: any, res) => {
    try {
      console.log('🖨️ Batch print API request:', JSON.stringify(req.body, null, 2));
      
      const { urls, printerName, copies = 1, silent = true } = req.body;

      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "URLs array is required for batch printing"
        });
      }

      if (!printerName) {
        return res.status(400).json({ 
          success: false, 
          error: "Printer name is required"
        });
      }

      console.log(`🖨️ Batch print: ${urls.length} documents to ${printerName}`);

      // Extract print options
      const printOptions: PrintOptions = {
        copies,
        silent,
        pageSize: req.body.pageSize,
        orientation: req.body.orientation,
        colorMode: req.body.colorMode,
        duplex: req.body.duplex,
        quality: req.body.quality,
        mediaType: req.body.mediaType
      };

      // Download and combine all URLs into a single HTML document
      const combinedContent = await combinePrintUrls(urls);
      
      // Log the batch print request
      try {
        await storage.createPrintLog({
          printType: 'batch_receipt',
          targetPrinter: printerName,
          content: `Batch: ${urls.length} documents`,
          status: 'pending',
          printedAt: new Date(),
        });
      } catch (logError) {
        console.warn('Failed to log batch print request:', logError);
      }

      // Print the combined document as a single job
      console.log(`🖨️ Printing combined document with ${urls.length} pages`);
      const printResult = await printDocument(printerName, combinedContent, printOptions);
      
      console.log(`${printResult.success ? '✅' : '❌'} Batch print result:`, printResult);

      // Log batch print completion
      try {
        await storage.createPrintLog({
          printType: 'batch_receipt',
          targetPrinter: printerName,
          content: `Batch: ${urls.length} documents`,
          status: printResult.success ? 'success' : 'failed',
          printedAt: new Date(),
        });
      } catch (logError) {
        console.warn('Failed to log batch print completion:', logError);
      }

      const statusCode = printResult.success ? 200 : 500;
      res.status(statusCode).json({
        ...printResult,
        documentsProcessed: urls.length,
        batchPrint: true
      });

    } catch (error) {
      console.error('❌ Batch print error:', error);
      
      // Log failed batch print
      try {
        const { urls, printerName } = req.body;
        await storage.createPrintLog({
          printType: 'batch_receipt',
          targetPrinter: printerName || 'unknown',
          content: `Batch failed: ${urls?.length || 0} documents`,
          status: 'failed',
          printedAt: new Date(),
        });
      } catch (logError) {
        console.warn('Failed to log batch print error:', logError);
      }

      const errorMessage = error instanceof Error ? error.message : 'Batch print failed';
      res.status(500).json({ 
        success: false, 
        error: errorMessage,
        printerName: req.body.printerName || 'unknown',
        copies: req.body.copies || 1,
        timestamp: new Date().toISOString(),
        batchPrint: true,
        fallbackToBrowser: true
      });
    }
  });

  // Print job management endpoints
  app.get('/api/print/jobs/:jobId/status', isAuthenticated, async (req: any, res) => {
    try {
      const { jobId } = req.params;
      
      // Security: Validate job ID format before processing
      const jobIdValidation = jobIdSchema.safeParse(jobId);
      if (!jobIdValidation.success) {
        return res.status(400).json({ 
          success: false,
          error: "Invalid job ID format - only alphanumeric, hyphens, underscores and dots allowed",
          jobId: 'invalid'
        });
      }
      
      const jobStatus = await getPrintJobStatus(jobId);
      res.json(jobStatus);
    } catch (error) {
      console.error('Error getting print job status:', error);
      res.status(500).json({ 
        error: 'Failed to get print job status',
        jobId: 'error'
      });
    }
  });

  app.delete('/api/print/jobs/:jobId', isAuthenticated, async (req: any, res) => {
    try {
      const { jobId } = req.params;
      
      // Security: Validate job ID format before processing
      const jobIdValidation = jobIdSchema.safeParse(jobId);
      if (!jobIdValidation.success) {
        return res.status(400).json({ 
          success: false,
          error: "Invalid job ID format - only alphanumeric, hyphens, underscores and dots allowed",
          jobId: 'invalid'
        });
      }
      
      const cancelled = await cancelPrintJob(jobId);
      
      if (cancelled) {
        res.json({ 
          success: true, 
          message: `Print job ${jobId} cancelled successfully`,
          jobId 
        });
      } else {
        res.status(404).json({ 
          success: false, 
          error: `Print job ${jobId} not found or cannot be cancelled`,
          jobId 
        });
      }
    } catch (error) {
      console.error('Error cancelling print job:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to cancel print job',
        jobId: req.params.jobId 
      });
    }
  });

  app.get('/api/print/queue/:printerName?', isAuthenticated, async (req: any, res) => {
    try {
      const { printerName } = req.params;
      
      // Security: Validate printer name format if provided
      if (printerName && printerName !== 'undefined') {
        const printerNameValidation = printerNameSchema.safeParse(printerName);
        if (!printerNameValidation.success) {
          return res.status(400).json({ 
            error: "Invalid printer name format - only alphanumeric, hyphens, underscores and dots allowed",
            printerName: 'invalid'
          });
        }
      }
      
      const sanitizedPrinterName = printerName && printerName !== 'undefined' ? printerName : undefined;
      const queue = await getPrinterQueue(sanitizedPrinterName);
      res.json({
        printerName: sanitizedPrinterName || 'all',
        queue,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting printer queue:', error);
      res.status(500).json({ 
        error: 'Failed to get printer queue',
        printerName: 'error'
      });
    }
  });

  const httpServer = createServer(app);

  // WebSocket setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set<WebSocketClient>();

  wss.on('connection', (ws: WebSocketClient, req) => {
    console.log('WebSocket client connected');
    ws.isAlive = true; // Mark as alive immediately
    clients.add(ws);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'register') {
          ws.clientType = data.clientType;
          console.log(`Client registered as ${data.clientType}`);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', (code, reason) => {
      console.log('WebSocket client disconnected - Code:', code, 'Reason:', reason?.toString());
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  // WebSocket heartbeat - keep connections alive
  setInterval(() => {
    clients.forEach((ws) => {
      if (!ws.isAlive) {
        clients.delete(ws);
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 60000); // Increased to 60 seconds for stability

  // Internal broadcast function
  function internalBroadcastMessage(type: string, data: any, targetClientType?: string) {
    const message = JSON.stringify({ type, data });
    
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        if (!targetClientType || ws.clientType === targetClientType) {
          ws.send(message);
        }
      }
    });
  }

  // Make the internal broadcast function available globally
  (global as any).broadcastMessage = internalBroadcastMessage;

  return httpServer;
}
