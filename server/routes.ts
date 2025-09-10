import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertOrderSchema, insertOrderLineSchema, insertPaymentSchema, insertAuditLogSchema, insertDepartmentSchema, insertSettingSchema } from "@shared/schema";
import { z } from "zod";

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
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
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
      if (order.orderLines && order.orderLines.length > 0) {
        for (const orderLine of order.orderLines) {
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
      if (status === 'cancelled' && oldOrder?.status !== 'cancelled' && order.orderLines && order.orderLines.length > 0) {
        for (const orderLine of order.orderLines) {
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
      const orderLineData = insertOrderLineSchema.parse(req.body);
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
      
      res.status(201).json(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payment data", errors: error.errors });
      }
      console.error("Error processing payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
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
