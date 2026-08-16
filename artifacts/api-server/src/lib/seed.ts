import { and, eq } from "drizzle-orm";
import {
  auditLogsTable,
  attendanceRulesTable,
  attendanceTable,
  branchesTable,
  companiesTable,
  departmentsTable,
  devicesTable,
  employeesTable,
  leaveBalancesTable,
  leaveRequestsTable,
  permissionRequestsTable,
  payrollPeriodsTable,
  plansTable,
  subscriptionsTable,
} from "@workspace/db";
import { db } from "@workspace/db";
import { logger } from "./logger";

const seedDate = "2026-08-16";
const seedInstant = (hours: number, minutes: number) => {
  const value = new Date(`${seedDate}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+03:00`);
  return value;
};

export async function initializeDemoData(): Promise<void> {
  const [existing] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.slug, "northstar"))
    .limit(1);

  if (existing) {
    return;
  }

  logger.info("Seeding VAR HR operational foundation");
  const [company] = await db
    .insert(companiesTable)
    .values({
      name: "Northstar Logistics",
      slug: "northstar",
      timezone: "Africa/Cairo",
      currency: "EGP",
    })
    .returning();

  const [operations] = await db
    .insert(departmentsTable)
    .values({ companyId: company.id, name: "Operations" })
    .returning();
  const [people] = await db
    .insert(departmentsTable)
    .values({ companyId: company.id, name: "People & Culture" })
    .returning();
  const [cairo] = await db
    .insert(branchesTable)
    .values({
      companyId: company.id,
      name: "Cairo HQ",
      city: "Cairo",
      gpsEnabled: true,
      latitude: 30.0444,
      longitude: 31.2357,
      radiusMeters: 180,
    })
    .returning();
  const [alexandria] = await db
    .insert(branchesTable)
    .values({
      companyId: company.id,
      name: "Alexandria Hub",
      city: "Alexandria",
      gpsEnabled: false,
    })
    .returning();

  const seededEmployees = await db
    .insert(employeesTable)
    .values([
      {
        companyId: company.id,
        employeeNumber: "NS-1048",
        firstName: "Mariam",
        lastName: "Hassan",
        email: "mariam.hassan@northstar.example",
        phone: "+20 100 555 1048",
        departmentId: operations.id,
        branchId: cairo.id,
        status: "active",
        role: "employee",
        joinedOn: "2023-04-18",
        salary: 18500,
      },
      {
        companyId: company.id,
        employeeNumber: "NS-1021",
        firstName: "Omar",
        lastName: "Nassar",
        email: "omar.nassar@northstar.example",
        phone: "+20 100 555 1021",
        departmentId: operations.id,
        branchId: cairo.id,
        status: "active",
        role: "manager",
        joinedOn: "2022-10-02",
        salary: 26500,
      },
      {
        companyId: company.id,
        employeeNumber: "NS-0976",
        firstName: "Salma",
        lastName: "Youssef",
        email: "salma.youssef@northstar.example",
        phone: "+20 100 555 0976",
        departmentId: people.id,
        branchId: alexandria.id,
        status: "active",
        role: "employee",
        joinedOn: "2024-01-08",
        salary: 16200,
      },
      {
        companyId: company.id,
        employeeNumber: "NS-0874",
        firstName: "Karim",
        lastName: "Fahmy",
        email: "karim.fahmy@northstar.example",
        phone: "+20 100 555 0874",
        departmentId: operations.id,
        branchId: cairo.id,
        status: "inactive",
        role: "employee",
        joinedOn: "2021-06-14",
        salary: 14800,
      },
    ])
    .returning();

  await db.insert(attendanceRulesTable).values({
    companyId: company.id,
    workStart: "09:00",
    workEnd: "17:00",
    graceMinutes: 10,
    overtimeAfterMinutes: 30,
    workingDays: ["Sun", "Mon", "Tue", "Wed", "Thu"],
    gpsPolicy: "optional",
    locationRadiusMeters: 180,
    version: 3,
    effectiveFrom: "2026-07-01",
  });

  await db.insert(attendanceTable).values([
    {
      companyId: company.id,
      employeeId: seededEmployees[0].id,
      date: seedDate,
      status: "present",
      scheduledStart: "09:00",
      checkIn: seedInstant(8, 52),
      checkOut: null,
      workedHours: 6.5,
      overtimeHours: 0,
      lateMinutes: 0,
      locationStatus: "verified",
      source: "mobile",
      location: { latitude: 30.0445, longitude: 31.2358, accuracyMeters: 12 },
      explanation: "Check-in verified within Cairo HQ radius.",
    },
    {
      companyId: company.id,
      employeeId: seededEmployees[1].id,
      date: seedDate,
      status: "late",
      scheduledStart: "09:00",
      checkIn: seedInstant(9, 18),
      checkOut: null,
      workedHours: 6,
      overtimeHours: 0,
      lateMinutes: 18,
      locationStatus: "verified",
      source: "biometric",
      explanation: "18 minutes after scheduled start; 10 minute grace period applied.",
    },
    {
      companyId: company.id,
      employeeId: seededEmployees[2].id,
      date: seedDate,
      status: "on_leave",
      scheduledStart: "09:00",
      workedHours: 0,
      overtimeHours: 0,
      lateMinutes: 0,
      locationStatus: "not_required",
      source: "manual",
      explanation: "Approved annual leave.",
    },
  ]);

  await db.insert(leaveBalancesTable).values(
    seededEmployees.slice(0, 3).flatMap((employee) => [
      {
        companyId: company.id,
        employeeId: employee.id,
        type: "Annual leave",
        allocated: 21,
        used: employee.firstName === "Salma" ? 7 : 8,
        pending: employee.firstName === "Mariam" ? 2 : 0,
      },
      {
        companyId: company.id,
        employeeId: employee.id,
        type: "Sick leave",
        allocated: 12,
        used: 1,
        pending: 0,
      },
    ]),
  );

  await db.insert(leaveRequestsTable).values([
    {
      companyId: company.id,
      employeeId: seededEmployees[0].id,
      type: "Annual leave",
      from: "2026-08-24",
      to: "2026-08-25",
      days: 2,
      reason: "Family commitment outside Cairo.",
      status: "pending",
    },
    {
      companyId: company.id,
      employeeId: seededEmployees[2].id,
      type: "Annual leave",
      from: "2026-08-12",
      to: "2026-08-12",
      days: 1,
      reason: "Personal appointment.",
      status: "approved",
      submittedAt: seedInstant(10, 15),
      decidedBy: "Omar Nassar",
      decisionReason: "Approved within team coverage.",
    },
  ]);

  await db.insert(permissionRequestsTable).values([
    {
      companyId: company.id,
      employeeId: seededEmployees[1].id,
      type: "Late arrival",
      date: "2026-08-19",
      startTime: "10:00",
      endTime: "11:00",
      reason: "Medical appointment.",
      status: "pending",
    },
    {
      companyId: company.id,
      employeeId: seededEmployees[0].id,
      type: "Early departure",
      date: "2026-08-20",
      startTime: "15:30",
      endTime: "17:00",
      reason: "School pickup.",
      status: "approved",
      decisionReason: "Coverage confirmed with Operations.",
    },
  ]);

  const [businessPlan] = await db
    .insert(plansTable)
    .values({
      name: "Business",
      employeeLimit: 50,
      managerLimit: 8,
      branchLimit: 5,
      deviceLimit: 4,
      features: ["gps_attendance", "payroll_foundation", "advanced_reports"],
    })
    .returning();
  await db.insert(subscriptionsTable).values({
    companyId: company.id,
    planId: businessPlan.id,
    status: "active",
  });
  await db.insert(devicesTable).values({
    companyId: company.id,
    name: "Cairo entrance reader",
    manufacturer: "Generic biometric reader",
    model: "Adapter pending",
    branchId: cairo.id,
    status: "not_configured",
    integrationState: "adapter_pending",
    note: "Hardware connector is not configured. No attendance sync is being simulated.",
  });
  await db.insert(payrollPeriodsTable).values({
    companyId: company.id,
    label: "August 2026",
    from: "2026-08-01",
    to: "2026-08-31",
    status: "calculated",
    employeeCount: 3,
    totalNet: 62800,
    calculatedAt: seedInstant(16, 30),
  });
  await db.insert(auditLogsTable).values({
    companyId: company.id,
    actorType: "workspace_demo",
    actorId: "demo-owner",
    action: "seeded",
    entityType: "company",
    entityId: company.id,
    after: { source: "initial operational foundation" },
  });
}