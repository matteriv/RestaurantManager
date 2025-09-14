import {
  type User,
  type UpsertUser,
  type Department,
  type InsertDepartment,
  type Setting,
  type InsertSetting,
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
  type LogoSettings,
  type InsertLogoSettings,
  type PrinterTerminal,
  type InsertPrinterTerminal,
  type PrinterDepartment,
  type InsertPrinterDepartment,
  type PrinterDepartmentWithDepartment,
  type PrintLog,
  type InsertPrintLog,
  type ManualPrinter,
  type InsertManualPrinter,
  LOGO_SETTING_KEYS,
} from "@shared/schema";
import { IStorage } from "./storage";

// In-memory storage implementation for temporary use while database is being fixed
export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private departments: Map<string, Department> = new Map();
  private settings: Map<string, Setting> = new Map();
  private menuCategories: Map<string, MenuCategory> = new Map();
  private menuItems: Map<string, MenuItem> = new Map();
  private tables: Map<string, Table> = new Map();
  private orders: Map<string, Order> = new Map();
  private orderLines: Map<string, OrderLine> = new Map();
  private payments: Map<string, Payment> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();
  private printerTerminals: Map<string, PrinterTerminal> = new Map();
  private printerDepartments: Map<string, PrinterDepartment> = new Map();
  private printLogs: Map<string, PrintLog> = new Map();
  private manualPrinters: Map<string, ManualPrinter> = new Map();
  private nextOrderNumber = 1;

  constructor() {
    this.initializeDefaults();
  }

  private initializeDefaults() {
    // Initialize default settings
    this.settings.set(LOGO_SETTING_KEYS.LOGO_URL, {
      id: '1',
      key: LOGO_SETTING_KEYS.LOGO_URL,
      value: '',
      description: 'Restaurant logo URL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.settings.set(LOGO_SETTING_KEYS.LOGO_NAME, {
      id: '2',
      key: LOGO_SETTING_KEYS.LOGO_NAME,
      value: '',
      description: 'Restaurant logo name',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.settings.set(LOGO_SETTING_KEYS.LOGO_ENABLED, {
      id: '3',
      key: LOGO_SETTING_KEYS.LOGO_ENABLED,
      value: 'false',
      description: 'Whether logo is enabled',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const id = userData.id || this.generateId();
    const existingUser = this.users.get(id);
    
    const user: User = {
      id,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      profileImageUrl: userData.profileImageUrl,
      role: userData.role || existingUser?.role || 'waiter',
      isActive: true,
      createdAt: existingUser?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    
    this.users.set(id, user);
    return user;
  }

  // Department operations
  async getDepartments(): Promise<Department[]> {
    return Array.from(this.departments.values())
      .filter(d => d.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createDepartment(department: InsertDepartment): Promise<Department> {
    const id = this.generateId();
    const newDepartment: Department = {
      id,
      ...department,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.departments.set(id, newDepartment);
    return newDepartment;
  }

  async updateDepartment(id: string, department: Partial<InsertDepartment>): Promise<Department> {
    const existing = this.departments.get(id);
    if (!existing) throw new Error('Department not found');
    
    const updated = { ...existing, ...department, updatedAt: new Date() };
    this.departments.set(id, updated);
    return updated;
  }

  async deleteDepartment(id: string): Promise<void> {
    const dept = this.departments.get(id);
    if (dept) {
      dept.isActive = false;
      this.departments.set(id, dept);
    }
  }

  // Settings operations
  async getSettings(): Promise<Setting[]> {
    return Array.from(this.settings.values());
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    return this.settings.get(key);
  }

  async upsertSetting(setting: InsertSetting): Promise<Setting> {
    const existing = this.settings.get(setting.key);
    const updated: Setting = {
      id: existing?.id || this.generateId(),
      ...setting,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    this.settings.set(setting.key, updated);
    return updated;
  }

  // Logo settings operations
  async getLogoSettings(): Promise<LogoSettings> {
    const logoUrl = this.settings.get(LOGO_SETTING_KEYS.LOGO_URL);
    const logoName = this.settings.get(LOGO_SETTING_KEYS.LOGO_NAME);
    const logoEnabled = this.settings.get(LOGO_SETTING_KEYS.LOGO_ENABLED);
    
    return {
      logo_url: logoUrl?.value || null,
      logo_name: logoName?.value || null,
      logo_enabled: logoEnabled?.value === 'true',
    };
  }

  async updateLogoSettings(logoSettings: InsertLogoSettings): Promise<LogoSettings> {
    if (logoSettings.logo_url !== undefined) {
      await this.upsertSetting({
        key: LOGO_SETTING_KEYS.LOGO_URL,
        value: logoSettings.logo_url || '',
        description: 'Restaurant logo URL',
      });
    }
    if (logoSettings.logo_name !== undefined) {
      await this.upsertSetting({
        key: LOGO_SETTING_KEYS.LOGO_NAME,
        value: logoSettings.logo_name || '',
        description: 'Restaurant logo name',
      });
    }
    if (logoSettings.logo_enabled !== undefined) {
      await this.upsertSetting({
        key: LOGO_SETTING_KEYS.LOGO_ENABLED,
        value: logoSettings.logo_enabled ? 'true' : 'false',
        description: 'Whether logo is enabled',
      });
    }
    return this.getLogoSettings();
  }

  // Menu operations
  async getMenuCategories(): Promise<MenuCategory[]> {
    return Array.from(this.menuCategories.values())
      .filter(c => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getMenuItems(categoryId?: string): Promise<MenuItem[]> {
    return Array.from(this.menuItems.values())
      .filter(item => item.isAvailable && (!categoryId || item.categoryId === categoryId));
  }

  async getMenuItem(id: string): Promise<MenuItem | undefined> {
    return this.menuItems.get(id);
  }

  async createMenuItem(item: InsertMenuItem): Promise<MenuItem> {
    const id = this.generateId();
    const newItem: MenuItem = {
      id,
      ...item,
      isAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.menuItems.set(id, newItem);
    return newItem;
  }

  async updateMenuItem(id: string, item: Partial<InsertMenuItem>): Promise<MenuItem> {
    const existing = this.menuItems.get(id);
    if (!existing) throw new Error('Menu item not found');
    
    const updated = { ...existing, ...item, updatedAt: new Date() };
    this.menuItems.set(id, updated);
    return updated;
  }

  async deleteMenuItem(id: string): Promise<void> {
    const item = this.menuItems.get(id);
    if (item) {
      item.isAvailable = false;
      this.menuItems.set(id, item);
    }
  }

  // Table operations
  async getTables(): Promise<Table[]> {
    return Array.from(this.tables.values())
      .filter(t => t.isActive)
      .sort((a, b) => a.number - b.number);
  }

  async getTable(id: string): Promise<Table | undefined> {
    return this.tables.get(id);
  }

  async updateTableStatus(id: string, status: string): Promise<Table> {
    const table = this.tables.get(id);
    if (!table) throw new Error('Table not found');
    
    table.status = status as any;
    this.tables.set(id, table);
    return table;
  }

  async getTablesWithOrders(): Promise<TableWithOrders[]> {
    const tables = await this.getTables();
    const orders = await this.getOrders();
    
    return tables.map(table => ({
      ...table,
      orders: orders.filter(o => o.tableId === table.id),
    }));
  }

  // Order operations
  async getOrders(status?: string): Promise<OrderWithDetails[]> {
    const orders = Array.from(this.orders.values())
      .filter(o => !status || o.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const result: OrderWithDetails[] = [];
    for (const order of orders) {
      const orderLines = await this.getOrderLines(order.id);
      const table = order.tableId ? await this.getTable(order.tableId) : undefined;
      const waiter = order.waiterId ? await this.getUser(order.waiterId) : undefined;
      
      result.push({
        ...order,
        table,
        waiter,
        orderLines,
        payments: [],
      });
    }
    
    return result;
  }

  async getOrder(id: string): Promise<OrderWithDetails | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const orderLines = await this.getOrderLines(order.id);
    const table = order.tableId ? await this.getTable(order.tableId) : undefined;
    const waiter = order.waiterId ? await this.getUser(order.waiterId) : undefined;
    
    return {
      ...order,
      table,
      waiter,
      orderLines,
      payments: [],
    };
  }

  async createOrder(orderData: InsertOrder): Promise<Order> {
    const id = this.generateId();
    const orderNumber = await this.getNextOrderNumber();
    
    const newOrder: Order = {
      id,
      orderNumber,
      status: orderData.status || 'new',
      tableId: orderData.tableId,
      waiterId: orderData.waiterId,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      customerEmail: orderData.customerEmail,
      notes: orderData.notes,
      total: orderData.total || 0,
      subtotal: orderData.subtotal || 0,
      tax: orderData.tax || 0,
      discount: orderData.discount || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.orders.set(id, newOrder);
    return newOrder;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const order = this.orders.get(id);
    if (!order) throw new Error('Order not found');
    
    order.status = status as any;
    order.updatedAt = new Date();
    this.orders.set(id, order);
    return order;
  }

  async getNextOrderNumber(): Promise<number> {
    return this.nextOrderNumber++;
  }

  // Order line operations
  async getOrderLines(orderId: string): Promise<(OrderLine & { menuItem: MenuItem })[]> {
    const orderLines = Array.from(this.orderLines.values())
      .filter(ol => ol.orderId === orderId);
    
    const result = [];
    for (const orderLine of orderLines) {
      const menuItem = await this.getMenuItem(orderLine.menuItemId);
      if (menuItem) {
        result.push({ ...orderLine, menuItem });
      }
    }
    
    return result;
  }

  async getOrderLine(id: string): Promise<(OrderLine & { menuItem: MenuItem }) | undefined> {
    const orderLine = this.orderLines.get(id);
    if (!orderLine) return undefined;
    
    const menuItem = await this.getMenuItem(orderLine.menuItemId);
    if (!menuItem) return undefined;
    
    return { ...orderLine, menuItem };
  }

  async createOrderLine(orderLine: InsertOrderLine & { orderId: string }): Promise<OrderLine> {
    const id = this.generateId();
    const newOrderLine: OrderLine = {
      id,
      ...orderLine,
      status: orderLine.status || 'pending',
      createdAt: new Date(),
    };
    
    this.orderLines.set(id, newOrderLine);
    return newOrderLine;
  }

  async updateOrderLineStatus(id: string, status: string): Promise<OrderLine> {
    const orderLine = this.orderLines.get(id);
    if (!orderLine) throw new Error('Order line not found');
    
    orderLine.status = status as any;
    if (status === 'preparing') {
      orderLine.startedAt = new Date();
    } else if (status === 'ready') {
      orderLine.completedAt = new Date();
    }
    
    this.orderLines.set(id, orderLine);
    return orderLine;
  }

  async deleteOrderLine(id: string): Promise<void> {
    this.orderLines.delete(id);
  }

  // Payment operations
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const id = this.generateId();
    const newPayment: Payment = {
      id,
      ...payment,
      createdAt: new Date(),
    };
    
    this.payments.set(id, newPayment);
    return newPayment;
  }

  // Audit operations
  async createAuditLog(auditLogData: InsertAuditLog): Promise<AuditLog> {
    const id = this.generateId();
    const newAuditLog: AuditLog = {
      id,
      ...auditLogData,
      createdAt: new Date(),
    };
    
    this.auditLogs.set(id, newAuditLog);
    return newAuditLog;
  }

  // Analytics
  async getDailySales(date: Date): Promise<{ total: number; orderCount: number; avgOrderValue: number }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const orders = Array.from(this.orders.values()).filter(
      o => o.status === 'paid' && 
      o.createdAt >= startOfDay && 
      o.createdAt <= endOfDay
    );
    
    const total = orders.reduce((sum, o) => sum + o.total, 0);
    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? total / orderCount : 0;
    
    return { total, orderCount, avgOrderValue };
  }

  async getTopDishes(date: Date, limit = 10): Promise<{ menuItem: MenuItem; orderCount: number; revenue: number }[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const orders = Array.from(this.orders.values()).filter(
      o => o.status === 'paid' && 
      o.createdAt >= startOfDay && 
      o.createdAt <= endOfDay
    );
    
    const dishStats = new Map<string, { menuItem: MenuItem; orderCount: number; revenue: number }>();
    
    for (const order of orders) {
      const orderLines = Array.from(this.orderLines.values()).filter(ol => ol.orderId === order.id);
      
      for (const orderLine of orderLines) {
        const menuItem = await this.getMenuItem(orderLine.menuItemId);
        if (menuItem) {
          const stats = dishStats.get(menuItem.id) || { menuItem, orderCount: 0, revenue: 0 };
          stats.orderCount += orderLine.quantity;
          stats.revenue += orderLine.totalPrice;
          dishStats.set(menuItem.id, stats);
        }
      }
    }
    
    return Array.from(dishStats.values())
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, limit);
  }

  async getKitchenPerformance(date: Date): Promise<{
    avgPrepTime: number;
    onTimeDelivery: number;
    totalItemsPrepared: number;
    stationPerformance: { station: string; avgTime: number; onTime: number; total: number }[];
  }> {
    // Simplified mock implementation
    return {
      avgPrepTime: 15,
      onTimeDelivery: 85,
      totalItemsPrepared: 100,
      stationPerformance: [],
    };
  }

  // Admin operations
  async resetSystem(): Promise<{ deletedOrders: number; deletedPayments: number; deletedAuditLogs: number; resetTables: number }> {
    const deletedOrders = this.orders.size;
    const deletedPayments = this.payments.size;
    const deletedAuditLogs = this.auditLogs.size;
    const resetTables = this.tables.size;
    
    this.orders.clear();
    this.orderLines.clear();
    this.payments.clear();
    this.auditLogs.clear();
    
    // Reset tables to free status
    for (const [id, table] of this.tables) {
      table.status = 'free';
      this.tables.set(id, table);
    }
    
    this.nextOrderNumber = 1;
    
    return { deletedOrders, deletedPayments, deletedAuditLogs, resetTables };
  }

  // Printer Terminal operations
  async getPrinterTerminals(posTerminalId?: string): Promise<PrinterTerminal[]> {
    return Array.from(this.printerTerminals.values())
      .filter(pt => !posTerminalId || pt.terminalId === posTerminalId);
  }

  async createPrinterTerminal(printerTerminal: InsertPrinterTerminal): Promise<PrinterTerminal> {
    const id = this.generateId();
    const newPrinterTerminal: PrinterTerminal = {
      id,
      ...printerTerminal,
      isDefault: printerTerminal.isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.printerTerminals.set(id, newPrinterTerminal);
    return newPrinterTerminal;
  }

  async updatePrinterTerminal(id: string, printerTerminal: Partial<InsertPrinterTerminal>): Promise<PrinterTerminal> {
    const existing = this.printerTerminals.get(id);
    if (!existing) throw new Error('Printer terminal not found');
    
    const updated = { ...existing, ...printerTerminal, updatedAt: new Date() };
    this.printerTerminals.set(id, updated);
    return updated;
  }

  async deletePrinterTerminal(id: string): Promise<void> {
    this.printerTerminals.delete(id);
  }

  // Printer Department operations
  async getPrinterDepartments(): Promise<PrinterDepartmentWithDepartment[]> {
    const result: PrinterDepartmentWithDepartment[] = [];
    
    for (const pd of this.printerDepartments.values()) {
      const department = this.departments.get(pd.departmentId);
      if (department) {
        result.push({ ...pd, department });
      }
    }
    
    return result;
  }

  async createPrinterDepartment(printerDepartment: InsertPrinterDepartment): Promise<PrinterDepartment> {
    const id = this.generateId();
    const newPrinterDepartment: PrinterDepartment = {
      id,
      ...printerDepartment,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.printerDepartments.set(id, newPrinterDepartment);
    return newPrinterDepartment;
  }

  async updatePrinterDepartment(id: string, printerDepartment: Partial<InsertPrinterDepartment>): Promise<PrinterDepartment> {
    const existing = this.printerDepartments.get(id);
    if (!existing) throw new Error('Printer department not found');
    
    const updated = { ...existing, ...printerDepartment, updatedAt: new Date() };
    this.printerDepartments.set(id, updated);
    return updated;
  }

  async deletePrinterDepartment(id: string): Promise<void> {
    this.printerDepartments.delete(id);
  }

  // Print Log operations
  async createPrintLog(printLog: InsertPrintLog): Promise<PrintLog> {
    const id = this.generateId();
    const newPrintLog: PrintLog = {
      id,
      ...printLog,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.printLogs.set(id, newPrintLog);
    return newPrintLog;
  }

  async getPrintLogs(filters?: { orderId?: string; status?: string; startDate?: Date; endDate?: Date }): Promise<PrintLog[]> {
    let logs = Array.from(this.printLogs.values());
    
    if (filters) {
      if (filters.orderId) {
        logs = logs.filter(l => l.orderId === filters.orderId);
      }
      if (filters.status) {
        logs = logs.filter(l => l.status === filters.status);
      }
      if (filters.startDate) {
        logs = logs.filter(l => l.createdAt >= filters.startDate!);
      }
      if (filters.endDate) {
        logs = logs.filter(l => l.createdAt <= filters.endDate!);
      }
    }
    
    return logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Manual Printer operations
  async getManualPrinters(): Promise<ManualPrinter[]> {
    return Array.from(this.manualPrinters.values())
      .filter(mp => mp.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getManualPrinter(id: string): Promise<ManualPrinter | undefined> {
    return this.manualPrinters.get(id);
  }

  async createManualPrinter(manualPrinter: InsertManualPrinter): Promise<ManualPrinter> {
    const id = this.generateId();
    
    // If this is being set as default, clear other defaults first
    if (manualPrinter.isDefault) {
      for (const [mpId, mp] of this.manualPrinters) {
        mp.isDefault = false;
        this.manualPrinters.set(mpId, mp);
      }
    }
    
    const newManualPrinter: ManualPrinter = {
      id,
      ...manualPrinter,
      isActive: true,
      isDefault: manualPrinter.isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.manualPrinters.set(id, newManualPrinter);
    return newManualPrinter;
  }

  async updateManualPrinter(id: string, manualPrinter: Partial<InsertManualPrinter>): Promise<ManualPrinter> {
    const existing = this.manualPrinters.get(id);
    if (!existing) throw new Error('Manual printer not found');
    
    // If this is being set as default, clear other defaults first
    if (manualPrinter.isDefault) {
      for (const [mpId, mp] of this.manualPrinters) {
        if (mpId !== id) {
          mp.isDefault = false;
          this.manualPrinters.set(mpId, mp);
        }
      }
    }
    
    const updated = { ...existing, ...manualPrinter, updatedAt: new Date() };
    this.manualPrinters.set(id, updated);
    return updated;
  }

  async deleteManualPrinter(id: string): Promise<void> {
    const printer = this.manualPrinters.get(id);
    if (printer) {
      printer.isActive = false;
      this.manualPrinters.set(id, printer);
    }
  }
}