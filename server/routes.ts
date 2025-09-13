import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { insertOrderSchema, insertOrderLineSchema, insertPaymentSchema, insertAuditLogSchema, insertDepartmentSchema, insertSettingSchema, insertMenuItemSchema, logoSettingsSchema, LOGO_SETTING_KEYS, insertPrinterTerminalSchema, insertPrinterDepartmentSchema, insertPrintLogSchema, paymentInfoSchema, type InsertOrderLine } from "@shared/schema";
import { z } from "zod";
import { getAvailablePrinters, clearPrinterCache, getCacheStatus } from "./printerDetection";
import { generateCustomerReceiptFromSettings, type PaymentInfo } from "./receiptGenerator";
import { generateDepartmentTicket, getDepartmentsWithItems } from "./departmentReceiptGenerator";

interface WebSocketClient extends WebSocket {
  isAlive?: boolean;
  clientType?: 'pos' | 'kds' | 'customer' | 'admin';
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
          const departmentIds = getDepartmentsWithItems(orderWithDetails);
          const departments = await storage.getDepartments();
          
          departmentReceiptUrls = departmentIds.reduce((urls, departmentId) => {
            const department = departments.find(d => d.id === departmentId);
            if (department) {
              urls[department.code] = `/api/receipts/department/${paymentData.orderId}/${department.code}`;
            }
            return urls;
          }, {} as Record<string, string>);
        } catch (error) {
          console.error("Error generating department receipt URLs:", error);
          // Continue without department URLs if there's an error
        }
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
      const receiptHTML = generateCustomerReceiptFromSettings(order, settings, paymentInfo);

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
      const receiptHTML = generateCustomerReceiptFromSettings(order, settings, paymentInfo);

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

      // Get department information
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
      const ticketHTML = generateDepartmentTicket(order, department);

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
      const validatedData = paymentProcessSchema.parse(req.body);
      const { tableId, orderItems, total, notes, receiptMethod } = validatedData;
      const userId = req.user.claims.sub;
      
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
      
      res.json({ 
        message: 'Payment processed successfully - receipt ready for printing',
        orderId: order.id,
        orderNumber,
        receiptId,
        qrCode: qrCodeDataUrl,
        receiptMethod: 'print'
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

  // Printer Terminal Configuration routes
  app.get('/api/printers/terminals', isAuthenticated, async (req: any, res) => {
    try {
      const posTerminalId = req.query.posTerminalId as string;
      const printerTerminals = await storage.getPrinterTerminals(posTerminalId);
      res.json(printerTerminals);
    } catch (error) {
      console.error("Error fetching printer terminals:", error);
      res.status(500).json({ message: "Failed to fetch printer terminals" });
    }
  });

  app.post('/api/printers/terminals', isAuthenticated, async (req: any, res) => {
    try {
      const printerTerminalData = insertPrinterTerminalSchema.parse(req.body);
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
            platform: require('os').platform(),
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

      // Log the print request
      try {
        await storage.createPrintLog({
          printerName,
          documentUrl: url,
          copies,
          status: 'attempted',
          userId,
          printedAt: new Date(),
        });
      } catch (logError) {
        console.warn('Failed to log print request:', logError);
      }

      // In a real implementation, this would interface with system printing APIs
      // For now, we'll simulate the printing process and return success
      // This could be extended to use libraries like:
      // - node-printer for Windows/Mac/Linux printing
      // - pdf-to-printer for PDF printing
      // - Or integrate with CUPS on Linux systems

      // Simulate printing delay
      const printDelay = Math.random() * 2000 + 500; // 500-2500ms
      
      await new Promise(resolve => setTimeout(resolve, printDelay));

      // For development/demo purposes, we'll always return success
      // In production, you'd implement actual printer communication here
      const printResult = {
        success: true,
        message: `Document sent to printer ${printerName}`,
        jobId: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        printerName,
        copies,
        timestamp: new Date().toISOString()
      };

      console.log(`✅ Print job completed:`, printResult);

      // Log successful print
      try {
        await storage.createPrintLog({
          printerName,
          documentUrl: url,
          copies,
          status: 'completed',
          userId,
          printedAt: new Date(),
        });
      } catch (logError) {
        console.warn('Failed to log print completion:', logError);
      }

      res.json(printResult);

    } catch (error) {
      console.error('❌ Direct print error:', error);
      
      // Log failed print
      try {
        const { url, printerName, copies = 1 } = req.body;
        const userId = req.user?.claims?.sub || 'unknown';
        
        await storage.createPrintLog({
          printerName: printerName || 'unknown',
          documentUrl: url || 'unknown',
          copies,
          status: 'failed',
          userId,
          printedAt: new Date(),
        });
      } catch (logError) {
        console.warn('Failed to log print error:', logError);
      }

      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Print job failed' 
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

  // Broadcast function
  function broadcastMessage(type: string, data: any, targetClientType?: string) {
    const message = JSON.stringify({ type, data });
    
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        if (!targetClientType || ws.clientType === targetClientType) {
          ws.send(message);
        }
      }
    });
  }

  // Make broadcastMessage available globally for this module
  (global as any).broadcastMessage = broadcastMessage;

  return httpServer;
}
