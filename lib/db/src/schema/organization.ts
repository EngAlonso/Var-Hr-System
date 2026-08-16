import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const companiesTable = pgTable("var_hr_companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Africa/Cairo"),
  currency: text("currency").notNull().default("EGP"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const departmentsTable = pgTable("var_hr_departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const branchesTable = pgTable("var_hr_branches", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  city: text("city").notNull(),
  gpsEnabled: boolean("gps_enabled").notNull().default(false),
  latitude: numeric("latitude", { precision: 10, scale: 7, mode: "number" }),
  longitude: numeric("longitude", { precision: 10, scale: 7, mode: "number" }),
  radiusMeters: numeric("radius_meters", { precision: 8, scale: 0, mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeesTable = pgTable("var_hr_employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  employeeNumber: text("employee_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  departmentId: uuid("department_id").notNull().references(() => departmentsTable.id),
  branchId: uuid("branch_id").notNull().references(() => branchesTable.id),
  status: text("status").notNull().default("active"),
  role: text("role").notNull().default("employee"),
  joinedOn: date("joined_on", { mode: "string" }).notNull(),
  salary: numeric("salary", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
});
export type Company = typeof companiesTable.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit({
  id: true,
  createdAt: true,
});
export type Department = typeof departmentsTable.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;

export const insertBranchSchema = createInsertSchema(branchesTable).omit({
  id: true,
  createdAt: true,
});
export type Branch = typeof branchesTable.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Employee = typeof employeesTable.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;