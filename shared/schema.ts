import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default('waiter'), // admin, manager, waiter, cook, cashier
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Departments (Reparti)
export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  code: varchar("code").notNull().unique(), // e.g., 'cucina', 'bar', 'pizza'
  isMain: boolean("is_main").default(false),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// System settings
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Menu categories
export const menuCategories = pgTable("menu_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Menu items
export const menuItems = pgTable("menu_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").references(() => menuCategories.id),
  departmentId: varchar("department_id").references(() => departments.id),
  name: varchar("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  prepTimeMinutes: integer("prep_time_minutes").default(0),
  isAvailable: boolean("is_available").default(true),
  allergens: text("allergens"), // JSON string array
  station: varchar("station"), // grill, fryer, cold_station, etc. (legacy field)
  // Inventory management fields
  currentStock: integer("current_stock").default(0),
  minStock: integer("min_stock").default(0),
  maxStock: integer("max_stock").default(0),
  trackInventory: boolean("track_inventory").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tables
export const tables = pgTable("tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  number: integer("number").notNull().unique(),
  seats: integer("seats").notNull(),
  status: varchar("status").notNull().default('free'), // free, occupied, closing, maintenance
  xPosition: integer("x_position").default(0),
  yPosition: integer("y_position").default(0),
  isActive: boolean("is_active").default(true),
});

// Order status enum
export const orderStatusEnum = pgEnum('order_status', [
  'new', 'preparing', 'ready', 'served', 'paid', 'cancelled'
]);

// Line status enum  
export const lineStatusEnum = pgEnum('line_status', [
  'new', 'preparing', 'ready', 'served'
]);

// Printer-related enums
export const connectionTypeEnum = pgEnum('connection_type', [
  'local', 'network', 'bluetooth'
]);

export const printTypeEnum = pgEnum('print_type', [
  'receipt', 'department_ticket'
]);

export const printStatusEnum = pgEnum('print_status', [
  'pending', 'success', 'failed', 'retry'
]);

// Orders
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: integer("order_number").notNull().unique(),
  tableId: varchar("table_id").references(() => tables.id),
  waiterId: varchar("waiter_id").references(() => users.id),
  posTerminalId: varchar("pos_terminal_id"), // Identify which POS terminal created the order
  status: orderStatusEnum("status").notNull().default('new'),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default('0'),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull().default('0'),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default('0'),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Order lines (individual items in an order)
export const orderLines = pgTable("order_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  menuItemId: varchar("menu_item_id").references(() => menuItems.id).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  status: lineStatusEnum("status").notNull().default('new'),
  notes: text("notes"),
  modifiers: text("modifiers"), // JSON string for variants/modifications
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Payments
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: varchar("method").notNull(), // cash, card, split
  processedBy: varchar("processed_by").references(() => users.id),
  receiptId: varchar("receipt_id"),
  qrCode: text("qr_code"),
  receiptMethod: varchar("receipt_method"),
  customerEmail: varchar("customer_email"),
  customerPhone: varchar("customer_phone"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Audit log for sensitive operations
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: varchar("action").notNull(), // create_order, cancel_order, refund, modify_menu, etc.
  entityType: varchar("entity_type").notNull(), // order, menu_item, user, etc.
  entityId: varchar("entity_id"),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  payments: many(payments),
  auditLogs: many(auditLog),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  menuItems: many(menuItems),
  printerDepartments: many(printerDepartments),
  printLogs: many(printLogs),
}));

export const menuCategoriesRelations = relations(menuCategories, ({ many }) => ({
  menuItems: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
  department: one(departments, {
    fields: [menuItems.departmentId],
    references: [departments.id],
  }),
  orderLines: many(orderLines),
}));

export const tablesRelations = relations(tables, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  table: one(tables, {
    fields: [orders.tableId],
    references: [tables.id],
  }),
  waiter: one(users, {
    fields: [orders.waiterId],
    references: [users.id],
  }),
  orderLines: many(orderLines),
  payments: many(payments),
}));

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, {
    fields: [orderLines.orderId],
    references: [orders.id],
  }),
  menuItem: one(menuItems, {
    fields: [orderLines.menuItemId],
    references: [menuItems.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  processedByUser: one(users, {
    fields: [payments.processedBy],
    references: [users.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  id: true, // Include id for OIDC sub mapping
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
  role: true,
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export const insertMenuCategorySchema = createInsertSchema(menuCategories).omit({
  id: true,
  createdAt: true,
});

export const insertMenuItemSchema = createInsertSchema(menuItems).omit({
  id: true,
  createdAt: true,
});

export const insertTableSchema = createInsertSchema(tables).omit({
  id: true,
});

export const insertOrderLineSchema = createInsertSchema(orderLines).omit({
  id: true,
  orderId: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderLines: z.array(insertOrderLineSchema).optional(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
}).extend({
  receiptMethod: z.literal('print').default('print'),
  customerEmail: z.string().nullable().default(null),
  customerPhone: z.string().nullable().default(null),
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  createdAt: true,
});

// PaymentInfo validation schema for receipt generation (security against injection)
export const paymentInfoSchema = z.object({
  method: z.enum(['cash', 'card', 'split']).transform((val) => {
    // Transform to Italian display names securely
    switch (val) {
      case 'cash': return 'Contante';
      case 'card': return 'Carta';
      case 'split': return 'Misto';
      default: return 'Contante'; // Safe fallback
    }
  }),
  amount: z.number().positive().max(999999.99, "Amount too large"),
  received: z.number().positive().max(999999.99, "Received amount too large").optional(),
  change: z.number().min(0).max(999999.99, "Change amount too large").optional(),
  transactionId: z.string().max(100, "Transaction ID too long").regex(/^[a-zA-Z0-9\-_]*$/, "Invalid transaction ID format").optional()
}).strict();

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = z.infer<typeof insertMenuCategorySchema>;
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type Table = typeof tables.$inferSelect;
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderLine = typeof orderLines.$inferSelect;
export type InsertOrderLine = z.infer<typeof insertOrderLineSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Extended types for API responses
export type OrderWithDetails = Order & {
  table?: Table;
  waiter?: User;
  orderLines: (OrderLine & {
    menuItem: MenuItem;
  })[];
  payments: Payment[];
};

export type TableWithOrders = Table & {
  orders: OrderWithDetails[];
};

// Logo settings constants and types
export const LOGO_SETTING_KEYS = {
  LOGO_URL: 'logo_url',
  LOGO_NAME: 'logo_name', 
  LOGO_ENABLED: 'logo_enabled'
} as const;

export type LogoSettingKey = typeof LOGO_SETTING_KEYS[keyof typeof LOGO_SETTING_KEYS];

// Logo settings type
export type LogoSettings = {
  logo_url: string | null;
  logo_name: string | null;
  logo_enabled: boolean;
};

// Logo settings schema for validation
export const logoSettingsSchema = z.object({
  logo_url: z.string().url().nullable().optional(),
  logo_name: z.string().min(1).max(100).nullable().optional(),
  logo_enabled: z.boolean().optional()
});

export type InsertLogoSettings = z.infer<typeof logoSettingsSchema>;

// Printer configurations for POS terminals
export const printerTerminals = pgTable("printer_terminals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  terminalId: varchar("terminal_id").notNull(), // Allow multiple configurations per terminal
  printerName: varchar("printer_name").notNull(), // System printer name
  printerDescription: text("printer_description"), // Human-readable description
  isDefault: boolean("is_default").default(false), // Whether this is the default printer for this terminal
  connectionType: connectionTypeEnum("connection_type").notNull().default('local'),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Printer configurations for departments/stations
export const printerDepartments = pgTable("printer_departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  departmentId: varchar("department_id").references(() => departments.id).notNull().unique(), // One printer per department
  printerName: varchar("printer_name").notNull(), // System printer name
  printerDescription: text("printer_description"), // Human-readable description
  connectionType: connectionTypeEnum("connection_type").notNull().default('local'),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Print job logging for tracking and debugging
export const printLogs = pgTable("print_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id),
  printerTerminalId: varchar("printer_terminal_id").references(() => printerTerminals.id), // FK to printer_terminals
  printerDepartmentId: varchar("printer_department_id").references(() => printerDepartments.id), // FK to printer_departments
  departmentId: varchar("department_id").references(() => departments.id), // FK to departments for consistency
  terminalId: varchar("terminal_id"), // Legacy field - which POS terminal initiated the print
  printType: printTypeEnum("print_type").notNull(),
  targetPrinter: varchar("target_printer").notNull(), // Printer name or identifier
  status: printStatusEnum("status").notNull().default('pending'),
  content: text("content"), // Print content for debugging
  errorMessage: text("error_message"), // Error details if failed
  retryCount: integer("retry_count").default(0),
  printedAt: timestamp("printed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_print_logs_order_id").on(table.orderId),
  index("IDX_print_logs_status_created").on(table.status, table.createdAt),
  index("IDX_print_logs_terminal_id").on(table.terminalId),
]);

// Relations for printer tables
export const printerTerminalsRelations = relations(printerTerminals, ({ many }) => ({
  printLogs: many(printLogs, {
    relationName: "printerTerminalLogs"
  }),
}));

export const printerDepartmentsRelations = relations(printerDepartments, ({ one, many }) => ({
  department: one(departments, {
    fields: [printerDepartments.departmentId],
    references: [departments.id],
  }),
  printLogs: many(printLogs, {
    relationName: "printerDepartmentLogs"
  }),
}));

export const printLogsRelations = relations(printLogs, ({ one }) => ({
  order: one(orders, {
    fields: [printLogs.orderId],
    references: [orders.id],
  }),
  printerTerminal: one(printerTerminals, {
    fields: [printLogs.printerTerminalId],
    references: [printerTerminals.id],
    relationName: "printerTerminalLogs"
  }),
  printerDepartment: one(printerDepartments, {
    fields: [printLogs.printerDepartmentId],
    references: [printerDepartments.id],
    relationName: "printerDepartmentLogs"
  }),
  department: one(departments, {
    fields: [printLogs.departmentId],
    references: [departments.id],
  }),
}));

// Insert schemas for printer tables
export const insertPrinterTerminalSchema = createInsertSchema(printerTerminals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPrinterDepartmentSchema = createInsertSchema(printerDepartments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPrintLogSchema = createInsertSchema(printLogs).omit({
  id: true,
  createdAt: true,
});

// Types for printer tables
export type PrinterTerminal = typeof printerTerminals.$inferSelect;
export type InsertPrinterTerminal = z.infer<typeof insertPrinterTerminalSchema>;
export type PrinterDepartment = typeof printerDepartments.$inferSelect;
export type InsertPrinterDepartment = z.infer<typeof insertPrinterDepartmentSchema>;
export type PrintLog = typeof printLogs.$inferSelect;
export type InsertPrintLog = z.infer<typeof insertPrintLogSchema>;

// Extended types for API responses
export type PrinterDepartmentWithDepartment = PrinterDepartment & {
  department: Department;
};

// Print job data structure
export type PrintJob = {
  orderId: string;
  terminalId: string;
  printType: 'receipt' | 'department_ticket';
  targetPrinter: string;
  content: string;
  departmentId?: string; // For department tickets
};
