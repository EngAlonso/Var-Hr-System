import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
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
import { branchesTable, companiesTable, departmentsTable, employeesTable } from "./organization";

export const attendanceTable = pgTable("var_hr_attendance", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id),
  date: date("date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("present"),
  scheduledStart: text("scheduled_start").notNull().default("09:00"),
  checkIn: timestamp("check_in", { withTimezone: true }),
  checkOut: timestamp("check_out", { withTimezone: true }),
  workedHours: numeric("worked_hours", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
  overtimeHours: numeric("overtime_hours", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
  lateMinutes: integer("late_minutes").notNull().default(0),
  locationStatus: text("location_status").notNull().default("not_required"),
  source: text("source").notNull().default("web"),
  location: jsonb("location"),
  explanation: text("explanation").notNull().default("Attendance event recorded."),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leaveRequestsTable = pgTable("var_hr_leave_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id),
  type: text("type").notNull(),
  from: date("from", { mode: "string" }).notNull(),
  to: date("to", { mode: "string" }).notNull(),
  days: numeric("days", { precision: 6, scale: 2, mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  decidedBy: text("decided_by"),
  decisionReason: text("decision_reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const permissionRequestsTable = pgTable("var_hr_permission_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id),
  type: text("type").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  decisionReason: text("decision_reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const attendanceRulesTable = pgTable("var_hr_attendance_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  workStart: text("work_start").notNull().default("09:00"),
  workEnd: text("work_end").notNull().default("17:00"),
  graceMinutes: integer("grace_minutes").notNull().default(10),
  overtimeAfterMinutes: integer("overtime_after_minutes").notNull().default(30),
  workingDays: text("working_days").array().notNull().default(["Mon", "Tue", "Wed", "Thu", "Sun"]),
  gpsPolicy: text("gps_policy").notNull().default("optional"),
  locationRadiusMeters: integer("location_radius_meters").notNull().default(150),
  version: integer("version").notNull().default(1),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leaveBalancesTable = pgTable("var_hr_leave_balances", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  employeeId: uuid("employee_id").notNull().references(() => employeesTable.id),
  type: text("type").notNull(),
  allocated: numeric("allocated", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
  used: numeric("used", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
  pending: numeric("pending", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
});

export const auditLogsTable = pgTable("var_hr_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id),
  actorType: text("actor_type").notNull().default("workspace_demo"),
  actorId: text("actor_id").notNull().default("demo-actor"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Attendance = typeof attendanceTable.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
export type PermissionRequest = typeof permissionRequestsTable.$inferSelect;
export type AttendanceRules = typeof attendanceRulesTable.$inferSelect;
export type LeaveBalance = typeof leaveBalancesTable.$inferSelect;
export type AuditLog = typeof auditLogsTable.$inferSelect;

export const organizationRelations = {
  companies: companiesTable,
  departments: departmentsTable,
  branches: branchesTable,
};