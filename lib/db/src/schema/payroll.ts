import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { companiesTable, employeesTable, branchesTable } from "./organization";

export const payrollPeriodsTable = pgTable("var_hr_payroll_periods", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  label: text("label").notNull(),
  from: date("from", { mode: "string" }).notNull(),
  to: date("to", { mode: "string" }).notNull(),
  status: text("status").notNull().default("draft"),
  employeeCount: integer("employee_count").notNull().default(0),
  totalNet: numeric("total_net", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }),
});

export const payrollCalculationsTable = pgTable("var_hr_payroll_calculations", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  periodId: uuid("period_id").notNull().references(() => payrollPeriodsTable.id),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id),
  basicSalary: numeric("basic_salary", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  additions: numeric("additions", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  overtime: numeric("overtime", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  attendanceDeductions: numeric("attendance_deductions", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  otherDeductions: numeric("other_deductions", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  netSalary: numeric("net_salary", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  lineItems: jsonb("line_items").notNull().default([]),
  calculationVersion: integer("calculation_version").notNull().default(1),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const devicesTable = pgTable("var_hr_devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  branchId: uuid("branch_id").notNull().references(() => branchesTable.id),
  status: text("status").notNull().default("not_configured"),
  integrationState: text("integration_state").notNull().default("adapter_pending"),
  lastSync: timestamp("last_sync", { withTimezone: true }),
  note: text("note").notNull().default("Connector adapter not configured yet."),
});

export const plansTable = pgTable("var_hr_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  employeeLimit: integer("employee_limit").notNull(),
  managerLimit: integer("manager_limit").notNull().default(0),
  branchLimit: integer("branch_limit").notNull().default(0),
  deviceLimit: integer("device_limit").notNull().default(0),
  features: text("features").array().notNull().default([]),
});

export const subscriptionsTable = pgTable("var_hr_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  planId: uuid("plan_id").notNull().references(() => plansTable.id),
  status: text("status").notNull().default("trial"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPayrollPeriodSchema = createInsertSchema(payrollPeriodsTable).omit({
  id: true,
  calculatedAt: true,
});
export type PayrollPeriod = typeof payrollPeriodsTable.$inferSelect;
export type PayrollCalculation = typeof payrollCalculationsTable.$inferSelect;
export type Device = typeof devicesTable.$inferSelect;
export type Plan = typeof plansTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertPayrollPeriod = z.infer<typeof insertPayrollPeriodSchema>;