import {
  users,
  departments,
  settings,
  systemConfig,
  menuCategories,
  menuItems,
  tables,
  orders,
  orderLines,
  payments,
  auditLog,
  type User,
  type UpsertUser,
  type Department,
  type InsertDepartment,
  type Setting,
  type InsertSetting,
  type SystemConfig,
  type InsertSystemConfig,
  type MenuCategory,
  type InsertMenuCategory,
  type MenuItem,
  type InsertMenuItem,
  type Table,
  type InsertTable,
  type Order,
  type InsertOrder,
  type OrderLine,
  type InsertOrderLine,
  type Payment,
  type InsertPayment,
  type AuditLog,
  type InsertAuditLog,
  type OrderWithDetails,
  type TableWithOrders,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Department operations
  getDepartments(): Promise<Department[]>;
  createDepartment(department: InsertDepartment): Promise<Department>;
  updateDepartment(id: string, department: Partial<InsertDepartment>): Promise<Department>;
  deleteDepartment(id: string): Promise<void>;

  // Settings operations
  getSettings(): Promise<Setting[]>;
  getSetting(key: string): Promise<Setting | undefined>;
  upsertSetting(setting: InsertSetting): Promise<Setting>;

  // System configuration operations
  getSystemConfig(): Promise<SystemConfig | undefined>;
  createSystemConfig(config: InsertSystemConfig): Promise<SystemConfig>;
  updateSystemConfig(config: Partial<InsertSystemConfig>): Promise<SystemConfig>;
  isSetupComplete(): Promise<boolean>;

  // Menu operations
  getMenuCategories(): Promise<MenuCategory[]>;
  getMenuItems(categoryId?: string): Promise<MenuItem[]>;
  getMenuItem(id: string): Promise<MenuItem | undefined>;
  createMenuItem(item: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, item: Partial<InsertMenuItem>): Promise<MenuItem>;
  deleteMenuItem(id: string): Promise<void>;

  // Table operations
  getTables(): Promise<Table[]>;
  getTable(id: string): Promise<Table | undefined>;
  updateTableStatus(id: string, status: string): Promise<Table>;
  getTablesWithOrders(): Promise<TableWithOrders[]>;

  // Order operations
  getOrders(status?: string): Promise<OrderWithDetails[]>;
  getOrder(id: string): Promise<OrderWithDetails | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order>;
  getNextOrderNumber(): Promise<number>;

  // Order line operations
  getOrderLines(orderId: string): Promise<(OrderLine & { menuItem: MenuItem })[]>;
  getOrderLine(id: string): Promise<(OrderLine & { menuItem: MenuItem }) | undefined>;
  createOrderLine(orderLine: InsertOrderLine & { orderId: string }): Promise<OrderLine>;
  updateOrderLineStatus(id: string, status: string): Promise<OrderLine>;
  deleteOrderLine(id: string): Promise<void>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;

  // Audit operations
  createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog>;

  // Analytics
  getDailySales(date: Date): Promise<{ total: number; orderCount: number; avgOrderValue: number }>;
  getTopDishes(date: Date, limit?: number): Promise<{ menuItem: MenuItem; orderCount: number; revenue: number }[]>;
  getKitchenPerformance(date: Date): Promise<{
    avgPrepTime: number;
    onTimeDelivery: number;
    totalItemsPrepared: number;
    stationPerformance: { station: string; avgTime: number; onTime: number; total: number }[];
  }>;

  // Admin operations
  resetSystem(): Promise<{ deletedOrders: number; deletedPayments: number; deletedAuditLogs: number; resetTables: number }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // If ID is provided (like OIDC sub), use it as primary key
    if (userData.id) {
      // Try to find existing user by ID first
      let existingUser = await this.getUser(userData.id);
      
      if (existingUser) {
        // Update existing user by ID
        const [user] = await db
          .update(users)
          .set({
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            role: userData.role || existingUser.role, // Keep existing role if not specified
            updatedAt: new Date(),
          })
          .where(eq(users.id, userData.id))
          .returning();
        return user;
      } else {
        // Check if user exists by email (handle migration case)
        const userByEmailResult = userData.email ? await db.select().from(users).where(eq(users.email, userData.email)) : [];
        const [userByEmail] = userByEmailResult;
        
        if (userByEmail) {
          // Update existing user by email, set the new ID
          const [user] = await db
            .update(users)
            .set({
              id: userData.id, // Update to use OIDC sub as ID
              firstName: userData.firstName,
              lastName: userData.lastName,
              profileImageUrl: userData.profileImageUrl,
              role: userData.role || userByEmail.role, // Keep existing role if not specified
              updatedAt: new Date(),
            })
            .where(eq(users.email, userData.email!))
            .returning();
          return user;
        } else {
          // Insert new user with specified ID
          const [user] = await db
            .insert(users)
            .values({
              ...userData,
              id: userData.id,
              role: userData.role || 'waiter', // Default role
            })
            .returning();
          return user;
        }
      }
    } else {
      // Fallback to email-based upsert (original behavior)
      const [user] = await db
        .insert(users)
        .values(userData)
        .onConflictDoUpdate({
          target: users.email,
          set: {
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            role: userData.role,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    }
  }

  // Department operations
  async getDepartments(): Promise<Department[]> {
    return await db
      .select()
      .from(departments)
      .where(eq(departments.isActive, true))
      .orderBy(departments.sortOrder);
  }

  async createDepartment(department: InsertDepartment): Promise<Department> {
    const [newDepartment] = await db.insert(departments).values(department).returning();
    return newDepartment;
  }

  async updateDepartment(id: string, department: Partial<InsertDepartment>): Promise<Department> {
    const [updatedDepartment] = await db
      .update(departments)
      .set(department)
      .where(eq(departments.id, id))
      .returning();
    return updatedDepartment;
  }

  async deleteDepartment(id: string): Promise<void> {
    await db
      .update(departments)
      .set({ isActive: false })
      .where(eq(departments.id, id));
  }

  // Settings operations
  async getSettings(): Promise<Setting[]> {
    return await db.select().from(settings);
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async upsertSetting(setting: InsertSetting): Promise<Setting> {
    const [upsertedSetting] = await db
      .insert(settings)
      .values({
        ...setting,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: setting.value,
          description: setting.description,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upsertedSetting;
  }

  // System configuration operations
  async getSystemConfig(): Promise<SystemConfig | undefined> {
    const [config] = await db.select().from(systemConfig).limit(1);
    return config;
  }

  async createSystemConfig(configData: InsertSystemConfig): Promise<SystemConfig> {
    const [newConfig] = await db
      .insert(systemConfig)
      .values({
        ...configData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newConfig;
  }

  async updateSystemConfig(updates: Partial<InsertSystemConfig>): Promise<SystemConfig> {
    // Get existing config first
    const existing = await this.getSystemConfig();
    
    if (!existing) {
      // Create new config if none exists
      return this.createSystemConfig(updates as InsertSystemConfig);
    }

    const [updatedConfig] = await db
      .update(systemConfig)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(systemConfig.id, existing.id))
      .returning();
    
    return updatedConfig;
  }

  async isSetupComplete(): Promise<boolean> {
    const config = await this.getSystemConfig();
    return config?.setupComplete ?? false;
  }

  // Menu operations
  async getMenuCategories(): Promise<MenuCategory[]> {
    return await db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.isActive, true))
      .orderBy(menuCategories.sortOrder);
  }

  async getMenuItems(categoryId?: string): Promise<MenuItem[]> {
    if (categoryId) {
      return await db.select().from(menuItems).where(and(eq(menuItems.isAvailable, true), eq(menuItems.categoryId, categoryId)));
    }
    
    return await db.select().from(menuItems).where(eq(menuItems.isAvailable, true));
  }

  async getMenuItem(id: string): Promise<MenuItem | undefined> {
    const [item] = await db.select().from(menuItems).where(eq(menuItems.id, id));
    return item;
  }

  async createMenuItem(item: InsertMenuItem): Promise<MenuItem> {
    const [menuItem] = await db.insert(menuItems).values(item).returning();
    return menuItem;
  }

  async updateMenuItem(id: string, item: Partial<InsertMenuItem>): Promise<MenuItem> {
    const [menuItem] = await db
      .update(menuItems)
      .set(item)
      .where(eq(menuItems.id, id))
      .returning();
    return menuItem;
  }

  async deleteMenuItem(id: string): Promise<void> {
    await db
      .update(menuItems)
      .set({ isAvailable: false })
      .where(eq(menuItems.id, id));
  }

  // Table operations
  async getTables(): Promise<Table[]> {
    return await db
      .select()
      .from(tables)
      .where(eq(tables.isActive, true))
      .orderBy(tables.number);
  }

  async getTable(id: string): Promise<Table | undefined> {
    const [table] = await db.select().from(tables).where(eq(tables.id, id));
    return table;
  }

  async updateTableStatus(id: string, status: string): Promise<Table> {
    const [table] = await db
      .update(tables)
      .set({ status })
      .where(eq(tables.id, id))
      .returning();
    return table;
  }

  async getTablesWithOrders(): Promise<TableWithOrders[]> {
    const tablesData = await db
      .select({
        table: tables,
        order: orders,
        orderLine: orderLines,
        menuItem: menuItems,
        waiter: users,
      })
      .from(tables)
      .leftJoin(orders, eq(tables.id, orders.tableId))
      .leftJoin(orderLines, eq(orders.id, orderLines.orderId))
      .leftJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
      .leftJoin(users, eq(orders.waiterId, users.id))
      .where(eq(tables.isActive, true))
      .orderBy(tables.number);

    // Group results by table
    const groupedTables = new Map<string, TableWithOrders>();
    
    for (const row of tablesData) {
      const tableId = row.table.id;
      
      if (!groupedTables.has(tableId)) {
        groupedTables.set(tableId, {
          ...row.table,
          orders: [],
        });
      }
      
      const table = groupedTables.get(tableId)!;
      
      if (row.order) {
        let order = table.orders.find(o => o.id === row.order!.id);
        
        if (!order) {
          order = {
            ...row.order,
            table: row.table,
            waiter: row.waiter || undefined,
            orderLines: [],
            payments: [],
          };
          table.orders.push(order);
        }
        
        if (row.orderLine && row.menuItem) {
          order.orderLines.push({
            ...row.orderLine,
            menuItem: row.menuItem,
          });
        }
      }
    }
    
    return Array.from(groupedTables.values());
  }

  // Order operations
  async getOrders(status?: string): Promise<OrderWithDetails[]> {
    const query = db
      .select({
        order: orders,
        table: tables,
        waiter: users,
        orderLine: orderLines,
        menuItem: menuItems,
      })
      .from(orders)
      .leftJoin(tables, eq(orders.tableId, tables.id))
      .leftJoin(users, eq(orders.waiterId, users.id))
      .leftJoin(orderLines, eq(orders.id, orderLines.orderId))
      .leftJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
      .orderBy(desc(orders.createdAt));

    const results = status ? 
      await query.where(eq(orders.status, status as any)) :
      await query;

    // Group results by order
    const groupedOrders = new Map<string, OrderWithDetails>();
    
    for (const row of results) {
      const orderId = row.order.id;
      
      if (!groupedOrders.has(orderId)) {
        groupedOrders.set(orderId, {
          ...row.order,
          table: row.table || undefined,
          waiter: row.waiter || undefined,
          orderLines: [],
          payments: [],
        });
      }
      
      const order = groupedOrders.get(orderId)!;
      
      if (row.orderLine && row.menuItem) {
        order.orderLines.push({
          ...row.orderLine,
          menuItem: row.menuItem,
        });
      }
    }
    
    return Array.from(groupedOrders.values());
  }

  async getOrder(id: string): Promise<OrderWithDetails | undefined> {
    const results = await db
      .select({
        order: orders,
        table: tables,
        waiter: users,
        orderLine: orderLines,
        menuItem: menuItems,
      })
      .from(orders)
      .leftJoin(tables, eq(orders.tableId, tables.id))
      .leftJoin(users, eq(orders.waiterId, users.id))
      .leftJoin(orderLines, eq(orders.id, orderLines.orderId))
      .leftJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
      .where(eq(orders.id, id));

    if (results.length === 0) return undefined;

    const firstRow = results[0];
    const order: OrderWithDetails = {
      ...firstRow.order,
      table: firstRow.table || undefined,
      waiter: firstRow.waiter || undefined,
      orderLines: [],
      payments: [],
    };

    for (const row of results) {
      if (row.orderLine && row.menuItem) {
        order.orderLines.push({
          ...row.orderLine,
          menuItem: row.menuItem,
        });
      }
    }

    return order;
  }

  async createOrder(orderData: InsertOrder & { orderLines?: InsertOrderLine[] }): Promise<Order> {
    const orderNumber = await this.getNextOrderNumber();
    
    // Extract orderLines from the data and create order first
    const { orderLines: orderLinesData, ...orderOnly } = orderData;
    
    const [newOrder] = await db
      .insert(orders)
      .values({ ...orderOnly, orderNumber })
      .returning();

    // Create order lines if provided
    if (orderLinesData && orderLinesData.length > 0) {
      const orderLinesToInsert = orderLinesData.map(line => ({
        ...line,
        orderId: newOrder.id,
      }));
      
      await db.insert(orderLines).values(orderLinesToInsert);
    }

    return newOrder;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async getNextOrderNumber(): Promise<number> {
    const [result] = await db
      .select({ maxOrderNumber: sql<number>`COALESCE(MAX(${orders.orderNumber}), 0)` })
      .from(orders);
    return (result.maxOrderNumber || 0) + 1;
  }

  // Order line operations
  async getOrderLines(orderId: string): Promise<(OrderLine & { menuItem: MenuItem })[]> {
    return await db
      .select({
        orderLine: orderLines,
        menuItem: menuItems,
      })
      .from(orderLines)
      .innerJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
      .where(eq(orderLines.orderId, orderId))
      .then(results => 
        results.map(row => ({
          ...row.orderLine,
          menuItem: row.menuItem,
        }))
      );
  }

  async createOrderLine(orderLine: InsertOrderLine & { orderId: string }): Promise<OrderLine> {
    const [newOrderLine] = await db.insert(orderLines).values(orderLine).returning();
    return newOrderLine;
  }

  async updateOrderLineStatus(id: string, status: string): Promise<OrderLine> {
    const updates: any = { status: status as any };
    
    if (status === 'preparing') {
      updates.startedAt = new Date();
    } else if (status === 'ready') {
      updates.completedAt = new Date();
    }

    const [orderLine] = await db
      .update(orderLines)
      .set(updates)
      .where(eq(orderLines.id, id))
      .returning();
    return orderLine;
  }

  async getOrderLine(id: string): Promise<(OrderLine & { menuItem: MenuItem }) | undefined> {
    const [result] = await db
      .select({ orderLine: orderLines, menuItem: menuItems })
      .from(orderLines)
      .innerJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
      .where(eq(orderLines.id, id));

    if (!result) return undefined;

    return {
      ...result.orderLine,
      menuItem: result.menuItem,
    };
  }

  async deleteOrderLine(id: string): Promise<void> {
    await db.delete(orderLines).where(eq(orderLines.id, id));
  }

  // Payment operations
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  // Audit operations
  async createAuditLog(auditLogData: InsertAuditLog): Promise<AuditLog> {
    const [newAuditLog] = await db.insert(auditLog).values(auditLogData).returning();
    return newAuditLog;
  }

  // Analytics
  async getDailySales(date: Date): Promise<{ total: number; orderCount: number; avgOrderValue: number }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [result] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
        orderCount: sql<number>`COUNT(*)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'paid'),
          sql`${orders.createdAt} >= ${startOfDay}`,
          sql`${orders.createdAt} <= ${endOfDay}`
        )
      );

    const total = Number(result.total) || 0;
    const orderCount = Number(result.orderCount) || 0;
    const avgOrderValue = orderCount > 0 ? total / orderCount : 0;

    return { total, orderCount, avgOrderValue };
  }

  async getTopDishes(date: Date, limit = 10): Promise<{ menuItem: MenuItem; orderCount: number; revenue: number }[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const results = await db
      .select({
        menuItem: menuItems,
        orderCount: sql<number>`SUM(${orderLines.quantity})`,
        revenue: sql<number>`SUM(${orderLines.totalPrice})`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orderLines.orderId, orders.id))
      .innerJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
      .where(
        and(
          eq(orders.status, 'paid'),
          sql`${orders.createdAt} >= ${startOfDay}`,
          sql`${orders.createdAt} <= ${endOfDay}`
        )
      )
      .groupBy(menuItems.id)
      .orderBy(sql`SUM(${orderLines.quantity}) DESC`)
      .limit(limit);

    return results.map(row => ({
      menuItem: row.menuItem,
      orderCount: Number(row.orderCount) || 0,
      revenue: Number(row.revenue) || 0,
    }));
  }

  async getKitchenPerformance(date: Date): Promise<{
    avgPrepTime: number;
    onTimeDelivery: number;
    totalItemsPrepared: number;
    stationPerformance: { station: string; avgTime: number; onTime: number; total: number }[];
  }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const results = await db
      .select({
        station: menuItems.station,
        expectedTime: menuItems.prepTimeMinutes,
        actualTime: sql<number>`EXTRACT(EPOCH FROM (${orderLines.completedAt} - ${orderLines.startedAt})) / 60`,
        quantity: orderLines.quantity,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orderLines.orderId, orders.id))
      .innerJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
      .where(and(
        sql`${orders.createdAt} >= ${startOfDay}`,
        sql`${orders.createdAt} <= ${endOfDay}`,
        sql`${orderLines.startedAt} IS NOT NULL`,
        sql`${orderLines.completedAt} IS NOT NULL`
      ));

    const totalItems = results.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const avgPrepTime = results.length > 0 ? results.reduce((sum, item) => sum + (item.actualTime || 0), 0) / results.length : 0;
    
    const onTimeItems = results.filter(item => 
      !item.expectedTime || (item.actualTime || 0) <= item.expectedTime
    ).reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    const onTimeDelivery = totalItems > 0 ? (onTimeItems / totalItems) * 100 : 0;

    // Station performance
    const stationMap = new Map<string, { times: number[]; quantities: number[]; onTime: number; total: number }>();
    
    results.forEach(item => {
      const station = item.station || 'Sconosciuta';
      if (!stationMap.has(station)) {
        stationMap.set(station, { times: [], quantities: [], onTime: 0, total: 0 });
      }
      const stationData = stationMap.get(station)!;
      stationData.times.push(item.actualTime || 0);
      stationData.quantities.push(item.quantity || 1);
      stationData.total += item.quantity || 1;
      
      if (!item.expectedTime || (item.actualTime || 0) <= item.expectedTime) {
        stationData.onTime += item.quantity || 1;
      }
    });

    const stationPerformance = Array.from(stationMap.entries()).map(([station, data]) => ({
      station,
      avgTime: data.times.length > 0 ? data.times.reduce((a, b) => a + b, 0) / data.times.length : 0,
      onTime: data.total > 0 ? (data.onTime / data.total) * 100 : 0,
      total: data.total,
    }));

    return {
      avgPrepTime,
      onTimeDelivery,
      totalItemsPrepared: totalItems,
      stationPerformance,
    };
  }

  // Admin operations
  async resetSystem(): Promise<{ deletedOrders: number; deletedPayments: number; deletedAuditLogs: number; resetTables: number }> {
    return await db.transaction(async (tx) => {
      try {
        // Get counts before deletion for logging
        const [orderCount] = await tx.select({ count: sql<number>`count(*)` }).from(orders);
        const [paymentCount] = await tx.select({ count: sql<number>`count(*)` }).from(payments);
        const [auditLogCount] = await tx.select({ count: sql<number>`count(*)` }).from(auditLog);
        const [tableCount] = await tx.select({ count: sql<number>`count(*)` }).from(tables);

        // Delete all order lines first (foreign key constraint)
        await tx.delete(orderLines);
        
        // Delete all payments
        await tx.delete(payments);
        
        // Delete all orders
        await tx.delete(orders);
        
        // Delete all audit logs
        await tx.delete(auditLog);
        
        // Reset all tables to 'free' status (removed updatedAt field as it doesn't exist in table schema)
        await tx.update(tables).set({ status: 'free' as any });

        return {
          deletedOrders: orderCount.count || 0,
          deletedPayments: paymentCount.count || 0,
          deletedAuditLogs: auditLogCount.count || 0,
          resetTables: tableCount.count || 0,
        };
      } catch (error) {
        console.error('Error resetting system:', error);
        throw new Error('Failed to reset system');
      }
    });
  }
}

export const storage = new DatabaseStorage();
