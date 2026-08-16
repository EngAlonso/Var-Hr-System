import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import {
  ApiError,
  AttendanceReport,
  CalculatePayrollParams,
  CheckInBody,
  CheckInResponse,
  CheckOutBody,
  CheckOutResponse,
  CreateBranchBody,
  CreateBranchResponse,
  CreateDepartmentBody,
  CreateDepartmentResponse,
  CreateDeviceBody,
  CreateDeviceResponse,
  CreateEmployeeBody,
  CreateEmployeeResponse,
  CreateLeaveRequestBody,
  CreateLeaveRequestResponse,
  CreatePermissionRequestBody,
  CreatePermissionRequestResponse,
  DashboardSummary,
  DecideLeaveRequestBody,
  DecideLeaveRequestParams,
  DecideLeaveRequestResponse,
  DecidePermissionRequestBody,
  DecidePermissionRequestParams,
  DecidePermissionRequestResponse,
  Department,
  GetAttendanceReportQueryParams,
  GetAttendanceReportResponse,
  GetAttendanceRulesResponse,
  GetAttendanceTodayResponse,
  GetDashboardSummaryResponse,
  GetEmployeeParams,
  GetEmployeeResponse,
  GetSubscriptionResponse,
  GetWorkspaceResponse,
  ListAttendanceHistoryQueryParams,
  ListAttendanceHistoryResponse,
  ListBranchesResponse,
  ListDepartmentsResponse,
  ListDevicesResponse,
  ListEmployeesQueryParams,
  ListEmployeesResponse,
  ListLeaveBalancesResponse,
  ListLeaveRequestsResponse,
  ListPayrollPeriodsResponse,
  ListPermissionRequestsResponse,
  ListPlatformCompaniesResponse,
  RequestDecisionInput,
  SyncDeviceParams,
  SyncDeviceResponse,
  UpdateAttendanceRulesBody,
  UpdateAttendanceRulesResponse,
  UpdateEmployeeBody,
  UpdateEmployeeParams,
  UpdateEmployeeResponse,
} from "@workspace/api-zod";
import {
  attendanceRulesTable,
  attendanceTable,
  auditLogsTable,
  branchesTable,
  companiesTable,
  departmentsTable,
  devicesTable,
  employeesTable,
  leaveBalancesTable,
  leaveRequestsTable,
  payrollCalculationsTable,
  payrollPeriodsTable,
  plansTable,
  permissionRequestsTable,
  subscriptionsTable,
} from "@workspace/db";
import { db } from "@workspace/db";
import {
  canApprove,
  canManageCompany,
  getTenantContext,
} from "../lib/tenant-context";

const router: IRouter = Router();
const TODAY = "2026-08-16";

function calendarDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function asDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function employeeRows(companyId: string) {
  return db
    .select({
      employee: employeesTable,
      department: departmentsTable,
      branch: branchesTable,
    })
    .from(employeesTable)
    .innerJoin(departmentsTable, eq(employeesTable.departmentId, departmentsTable.id))
    .innerJoin(branchesTable, eq(employeesTable.branchId, branchesTable.id))
    .where(eq(employeesTable.companyId, companyId))
    .orderBy(asc(employeesTable.firstName));
}

function employeeResponse(row: Awaited<ReturnType<typeof employeeRows>>[number]) {
  return {
    id: row.employee.id,
    employeeNumber: row.employee.employeeNumber,
    firstName: row.employee.firstName,
    lastName: row.employee.lastName,
    email: row.employee.email,
    phone: row.employee.phone,
    department: {
      id: row.department.id,
      name: row.department.name,
      employeeCount: 0,
    },
    branch: {
      id: row.branch.id,
      name: row.branch.name,
      city: row.branch.city,
      employeeCount: 0,
      gpsEnabled: row.branch.gpsEnabled,
    },
    status: row.employee.status as "active" | "inactive",
    role: row.employee.role as "employee" | "manager",
    joinedOn: calendarDate(row.employee.joinedOn)!,
    salary: row.employee.salary,
    avatarInitials: initials(row.employee.firstName, row.employee.lastName),
  };
}

function employeeReference(
  employee: typeof employeesTable.$inferSelect,
  departmentName: string,
) {
  return {
    id: employee.id,
    name: `${employee.firstName} ${employee.lastName}`,
    initials: initials(employee.firstName, employee.lastName),
    department: departmentName,
  };
}

async function recordAudit(
  companyId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  after: unknown,
) {
  await db.insert(auditLogsTable).values({
    companyId,
    actorType: "workspace_demo",
    actorId: "demo-actor",
    action,
    entityType,
    entityId,
    after,
  });
}

async function getAttendanceRows(companyId: string, from?: string, to?: string) {
  return db
    .select({
      attendance: attendanceTable,
      employee: employeesTable,
      department: departmentsTable,
    })
    .from(attendanceTable)
    .innerJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
    .innerJoin(departmentsTable, eq(employeesTable.departmentId, departmentsTable.id))
    .where(
      and(
        eq(attendanceTable.companyId, companyId),
        from ? gte(attendanceTable.date, from) : undefined,
        to ? lte(attendanceTable.date, to) : undefined,
      ),
    )
    .orderBy(desc(attendanceTable.date), asc(employeesTable.firstName));
}

function attendanceResponse(
  row: Awaited<ReturnType<typeof getAttendanceRows>>[number],
) {
  return {
    id: row.attendance.id,
    employee: employeeReference(row.employee, row.department.name),
    date: row.attendance.date,
    status: row.attendance.status as
      | "present"
      | "late"
      | "absent"
      | "on_leave"
      | "incomplete"
      | "holiday",
    scheduledStart: row.attendance.scheduledStart,
    checkIn: asDate(row.attendance.checkIn),
    checkOut: asDate(row.attendance.checkOut),
    workedHours: row.attendance.workedHours,
    overtimeHours: row.attendance.overtimeHours,
    lateMinutes: row.attendance.lateMinutes,
    locationStatus: row.attendance.locationStatus as
      | "not_required"
      | "verified"
      | "outside_geofence"
      | "low_accuracy"
      | "pending",
    source: row.attendance.source as "web" | "mobile" | "biometric" | "manual",
    explanation: row.attendance.explanation,
  };
}

function requestEmployeeReference(
  employee: typeof employeesTable.$inferSelect,
  departmentName: string,
) {
  return employeeReference(employee, departmentName);
}

async function leaveRows(companyId: string) {
  return db
    .select({
      request: leaveRequestsTable,
      employee: employeesTable,
      department: departmentsTable,
    })
    .from(leaveRequestsTable)
    .innerJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
    .innerJoin(departmentsTable, eq(employeesTable.departmentId, departmentsTable.id))
    .where(eq(leaveRequestsTable.companyId, companyId))
    .orderBy(desc(leaveRequestsTable.submittedAt));
}

async function permissionRows(companyId: string) {
  return db
    .select({
      request: permissionRequestsTable,
      employee: employeesTable,
      department: departmentsTable,
    })
    .from(permissionRequestsTable)
    .innerJoin(employeesTable, eq(permissionRequestsTable.employeeId, employeesTable.id))
    .innerJoin(departmentsTable, eq(employeesTable.departmentId, departmentsTable.id))
    .where(eq(permissionRequestsTable.companyId, companyId))
    .orderBy(desc(permissionRequestsTable.submittedAt));
}

router.get("/workspace", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const response = {
    company: {
      id: context.company.id,
      name: context.company.name,
      slug: context.company.slug,
      timezone: context.company.timezone,
      currency: context.company.currency,
    },
    role: context.role,
    locale: context.role === "employee" ? "fr" : "en",
    direction: context.role === "employee" ? "ltr" : "ltr",
    capabilities: canManageCompany(context.role)
      ? ["employees.manage", "attendance.correct", "payroll.view", "reports.export"]
      : ["attendance.view", "leave.create", "permissions.create"],
  };
  res.json(GetWorkspaceResponse.parse(response));
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const employees = (await employeeRows(context.companyId)).map(employeeResponse);
  const attendance = await getAttendanceRows(context.companyId, TODAY, TODAY);
  const leaves = await leaveRows(context.companyId);
  const permissions = await permissionRows(context.companyId);
  const [payroll] = await db
    .select()
    .from(payrollPeriodsTable)
    .where(eq(payrollPeriodsTable.companyId, context.companyId))
    .orderBy(desc(payrollPeriodsTable.to))
    .limit(1);
  const devices = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.companyId, context.companyId));

  const response = {
    date: TODAY,
    workforce: {
      activeEmployees: employees.filter((item) => item.status === "active").length,
      activeManagers: employees.filter(
        (item) => item.status === "active" && item.role === "manager",
      ).length,
      departments: new Set(employees.map((item) => item.department.id)).size,
      branches: new Set(employees.map((item) => item.branch.id)).size,
    },
    attendance: {
      present: attendance.filter((row) => row.attendance.status === "present").length,
      late: attendance.filter((row) => row.attendance.status === "late").length,
      absent: attendance.filter((row) => row.attendance.status === "absent").length,
      onLeave: attendance.filter((row) => row.attendance.status === "on_leave").length,
      overtimeHours: attendance.reduce(
        (total, row) => total + row.attendance.overtimeHours,
        0,
      ),
    },
    requests: {
      pendingLeave: leaves.filter((row) => row.request.status === "pending").length,
      pendingPermissions: permissions.filter(
        (row) => row.request.status === "pending",
      ).length,
    },
    payroll: {
      periodLabel: payroll?.label ?? "No period configured",
      status: (payroll?.status ?? "draft") as "draft" | "calculated" | "approved" | "locked",
      totalNet: payroll?.totalNet ?? 0,
    },
    devices: {
      total: devices.length,
      connected: devices.filter((device) => device.status === "connected").length,
      attention: devices.filter((device) => device.status !== "connected").length,
    },
    alerts: [
      {
        id: "device-adapter",
        severity: "info" as const,
        title: "Biometric connector pending",
        detail: "Device sync is intentionally unavailable until a manufacturer adapter is configured.",
      },
      ...(employees.filter((item) => item.status === "active").length >= 45
        ? [
            {
              id: "employee-limit",
              severity: "warning" as const,
              title: "Plan usage is approaching its limit",
              detail: "Review active employee usage before your next onboarding batch.",
            },
          ]
        : []),
    ],
  };
  res.json(GetDashboardSummaryResponse.parse(response));
});

router.get("/departments", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const departments = await db
    .select()
    .from(departmentsTable)
    .where(eq(departmentsTable.companyId, context.companyId))
    .orderBy(asc(departmentsTable.name));
  const employees = await db
    .select({ departmentId: employeesTable.departmentId })
    .from(employeesTable)
    .where(eq(employeesTable.companyId, context.companyId));
  const response = departments.map((department) => ({
    id: department.id,
    name: department.name,
    employeeCount: employees.filter((employee) => employee.departmentId === department.id).length,
  }));
  res.json(ListDepartmentsResponse.parse(response));
});

router.post("/departments", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!canManageCompany(context.role)) {
    res.status(403).json({ error: "You do not have permission to create departments." });
    return;
  }
  const parsed = CreateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [department] = await db
    .insert(departmentsTable)
    .values({ companyId: context.companyId, name: parsed.data.name })
    .returning();
  await recordAudit(context.companyId, "created", "department", department.id, department);
  res.status(201).json(CreateDepartmentResponse.parse({ id: department.id, name: department.name, employeeCount: 0 }));
});

router.get("/branches", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const branches = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.companyId, context.companyId))
    .orderBy(asc(branchesTable.name));
  const employees = await db
    .select({ branchId: employeesTable.branchId })
    .from(employeesTable)
    .where(eq(employeesTable.companyId, context.companyId));
  res.json(
    ListBranchesResponse.parse(
      branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        city: branch.city,
        employeeCount: employees.filter((employee) => employee.branchId === branch.id).length,
        gpsEnabled: branch.gpsEnabled,
      })),
    ),
  );
});

router.post("/branches", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!canManageCompany(context.role)) {
    res.status(403).json({ error: "You do not have permission to create branches." });
    return;
  }
  const parsed = CreateBranchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [branch] = await db
    .insert(branchesTable)
    .values({
      companyId: context.companyId,
      name: parsed.data.name,
      city: parsed.data.city,
      gpsEnabled: parsed.data.gpsEnabled,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      radiusMeters: parsed.data.radiusMeters,
    })
    .returning();
  await recordAudit(context.companyId, "created", "branch", branch.id, branch);
  res.status(201).json(
    CreateBranchResponse.parse({
      id: branch.id,
      name: branch.name,
      city: branch.city,
      employeeCount: 0,
      gpsEnabled: branch.gpsEnabled,
    }),
  );
});

router.get("/employees", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const query = ListEmployeesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const rows = await employeeRows(context.companyId);
  const filtered = rows.filter((row) => {
    const status = query.data.status ?? "all";
    const matchesStatus = status === "all" || row.employee.status === status;
    const matchesDepartment =
      !query.data.departmentId || row.employee.departmentId === query.data.departmentId;
    const haystack = `${row.employee.firstName} ${row.employee.lastName} ${row.employee.email} ${row.employee.employeeNumber}`.toLowerCase();
    const matchesSearch =
      !query.data.search || haystack.includes(query.data.search.toLowerCase());
    return matchesStatus && matchesDepartment && matchesSearch;
  });
  const response = filtered.map((row) => employeeResponse(row));
  res.json(ListEmployeesResponse.parse(response));
});

router.post("/employees", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!canManageCompany(context.role)) {
    res.status(403).json({ error: "You do not have permission to manage employees." });
    return;
  }
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [plan] = await db
    .select({ limit: plansTable.employeeLimit })
    .from(subscriptionsTable)
    .innerJoin(plansTable, eq(subscriptionsTable.planId, plansTable.id))
    .where(eq(subscriptionsTable.companyId, context.companyId))
    .limit(1);
  const activeCount = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(and(eq(employeesTable.companyId, context.companyId), eq(employeesTable.status, "active")));
  if (plan && activeCount.length >= plan.limit) {
    res.status(409).json({
      error: `Your current plan supports up to ${plan.limit} active employees.`,
      code: "ACTIVE_EMPLOYEE_LIMIT",
    });
    return;
  }
  const [employee] = await db
    .insert(employeesTable)
    .values({
      companyId: context.companyId,
      employeeNumber: `NS-${String(1100 + activeCount.length).padStart(4, "0")}`,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      departmentId: parsed.data.departmentId,
      branchId: parsed.data.branchId,
      status: "active",
      role: parsed.data.role ?? "employee",
      joinedOn: calendarDate(parsed.data.joinedOn)!,
      salary: parsed.data.salary,
    })
    .returning();
  const [row] = await employeeRows(context.companyId).then((rows) =>
    rows.filter((item) => item.employee.id === employee.id),
  );
  await recordAudit(context.companyId, "created", "employee", employee.id, employee);
  res.status(201).json(CreateEmployeeResponse.parse(employeeResponse(row)));
});

router.get("/employees/:employeeId", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const params = GetEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = (await employeeRows(context.companyId)).filter(
    (item) => item.employee.id === params.data.employeeId,
  );
  if (!row) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  res.json(GetEmployeeResponse.parse(employeeResponse(row)));
});

router.patch("/employees/:employeeId", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!canManageCompany(context.role)) {
    res.status(403).json({ error: "You do not have permission to manage employees." });
    return;
  }
  const params = UpdateEmployeeParams.safeParse(req.params);
  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [employee] = await db
    .update(employeesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(employeesTable.id, params.data.employeeId), eq(employeesTable.companyId, context.companyId)))
    .returning();
  if (!employee) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  const [row] = (await employeeRows(context.companyId)).filter(
    (item) => item.employee.id === employee.id,
  );
  await recordAudit(context.companyId, "updated", "employee", employee.id, parsed.data);
  res.json(UpdateEmployeeResponse.parse(employeeResponse(row)));
});

router.get("/attendance/today", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const rows = await getAttendanceRows(context.companyId, TODAY, TODAY);
  const summary = {
    present: rows.filter((row) => row.attendance.status === "present").length,
    late: rows.filter((row) => row.attendance.status === "late").length,
    absent: rows.filter((row) => row.attendance.status === "absent").length,
    onLeave: rows.filter((row) => row.attendance.status === "on_leave").length,
    overtimeHours: rows.reduce((total, row) => total + row.attendance.overtimeHours, 0),
  };
  res.json(GetAttendanceTodayResponse.parse({ date: TODAY, records: rows.map(attendanceResponse), summary }));
});

router.get("/attendance/history", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const query = ListAttendanceHistoryQueryParams.safeParse({
    ...req.query,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const rows = await getAttendanceRows(
    context.companyId,
    calendarDate(query.data.from),
    calendarDate(query.data.to),
  );
  res.json(
    ListAttendanceHistoryResponse.parse(
      rows
        .filter((row) => !query.data.employeeId || row.employee.id === query.data.employeeId)
        .map(attendanceResponse),
    ),
  );
});

async function recordCurrentAttendance(req: Request, res: Response, direction: "in" | "out"): Promise<void> {
  const context = await getTenantContext(req);
  if (!context.employeeId) {
    res.status(400).json({ error: "No active employee context is available." });
    return;
  }
  const bodySchema = direction === "in" ? CheckInBody : CheckOutBody;
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(attendanceTable)
    .where(and(eq(attendanceTable.companyId, context.companyId), eq(attendanceTable.employeeId, context.employeeId), eq(attendanceTable.date, TODAY)))
    .limit(1);
  const now = new Date();
  const location =
    parsed.data.latitude != null && parsed.data.longitude != null
      ? { latitude: parsed.data.latitude, longitude: parsed.data.longitude, accuracyMeters: parsed.data.accuracyMeters }
      : null;
  if (direction === "in") {
    const lateMinutes = Math.max(0, now.getHours() * 60 + now.getMinutes() - (9 * 60));
    if (existing) {
      const [updated] = await db
        .update(attendanceTable)
        .set({
          checkIn: existing.checkIn ?? now,
          status: lateMinutes > 10 ? "late" : "present",
          lateMinutes,
          source: parsed.data.source,
          locationStatus: location ? "pending" : "not_required",
          location,
          explanation: location ? "Check-in recorded; location policy validation is pending." : "Check-in recorded from the active workspace.",
          updatedAt: now,
        })
        .where(eq(attendanceTable.id, existing.id))
        .returning();
      const rows = await getAttendanceRows(context.companyId, TODAY, TODAY);
      res.status(201).json(CheckInResponse.parse(attendanceResponse(rows.find((row) => row.attendance.id === updated.id)!)));
      return;
    }
    const [created] = await db
      .insert(attendanceTable)
      .values({
        companyId: context.companyId,
        employeeId: context.employeeId,
        date: TODAY,
        status: lateMinutes > 10 ? "late" : "present",
        scheduledStart: "09:00",
        checkIn: now,
        workedHours: 0,
        overtimeHours: 0,
        lateMinutes,
        source: parsed.data.source,
        locationStatus: location ? "pending" : "not_required",
        location,
        explanation: location ? "Check-in recorded; location policy validation is pending." : "Check-in recorded from the active workspace.",
      })
      .returning();
    await recordAudit(context.companyId, "checked_in", "attendance", created.id, created);
    const rows = await getAttendanceRows(context.companyId, TODAY, TODAY);
    res.status(201).json(CheckInResponse.parse(attendanceResponse(rows.find((row) => row.attendance.id === created.id)!)));
    return;
  }

  if (!existing) {
    res.status(400).json({ error: "Check-in is required before check-out." });
    return;
  }
  const checkIn = existing.checkIn ?? now;
  const workedHours = Math.max(0, (now.getTime() - checkIn.getTime()) / 3_600_000);
  const overtimeHours = Math.max(0, workedHours - 8);
  const [updated] = await db
    .update(attendanceTable)
    .set({
      checkOut: now,
      workedHours: Number(workedHours.toFixed(2)),
      overtimeHours: Number(overtimeHours.toFixed(2)),
      source: parsed.data.source,
      locationStatus: location ? "pending" : existing.locationStatus,
      location: location ?? existing.location,
      explanation: `Worked ${workedHours.toFixed(2)} hours; ${overtimeHours.toFixed(2)} hours of overtime calculated from the active rule set.`,
      updatedAt: now,
    })
    .where(eq(attendanceTable.id, existing.id))
    .returning();
  await recordAudit(context.companyId, "checked_out", "attendance", updated.id, updated);
  const rows = await getAttendanceRows(context.companyId, TODAY, TODAY);
  res.status(201).json(CheckOutResponse.parse(attendanceResponse(rows.find((row) => row.attendance.id === updated.id)!)));
}

router.post("/attendance/check-in", async (req, res): Promise<void> => {
  await recordCurrentAttendance(req, res, "in");
});

router.post("/attendance/check-out", async (req, res): Promise<void> => {
  await recordCurrentAttendance(req, res, "out");
});

router.get("/leave/balances", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const balances = await db
    .select()
    .from(leaveBalancesTable)
    .where(and(eq(leaveBalancesTable.companyId, context.companyId), context.employeeId ? eq(leaveBalancesTable.employeeId, context.employeeId) : undefined));
  res.json(ListLeaveBalancesResponse.parse(balances.map((balance) => ({
    id: balance.id,
    type: balance.type,
    allocated: balance.allocated,
    used: balance.used,
    pending: balance.pending,
    remaining: Math.max(0, balance.allocated - balance.used - balance.pending),
  }))));
});

router.get("/leave/requests", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const rows = await leaveRows(context.companyId);
  const visible = context.role === "employee"
    ? rows.filter((row) => row.request.employeeId === context.employeeId)
    : rows;
  res.json(ListLeaveRequestsResponse.parse(visible.map((row) => ({
    id: row.request.id,
    employee: requestEmployeeReference(row.employee, row.department.name),
    type: row.request.type,
    from: row.request.from,
    to: row.request.to,
    days: row.request.days,
    reason: row.request.reason,
    status: row.request.status as "pending" | "approved" | "rejected" | "cancelled",
    submittedAt: row.request.submittedAt.toISOString(),
    decidedBy: row.request.decidedBy,
    decisionReason: row.request.decisionReason,
  }))));
});

router.post("/leave/requests", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!context.employeeId) {
    res.status(400).json({ error: "No active employee context is available." });
    return;
  }
  const parsed = CreateLeaveRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const from = new Date(`${calendarDate(parsed.data.from)}T00:00:00Z`);
  const to = new Date(`${calendarDate(parsed.data.to)}T00:00:00Z`);
  const days = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const [request] = await db.insert(leaveRequestsTable).values({
    companyId: context.companyId,
    employeeId: context.employeeId,
    type: parsed.data.type,
    from: calendarDate(parsed.data.from)!,
    to: calendarDate(parsed.data.to)!,
    days,
    reason: parsed.data.reason,
  }).returning();
  await recordAudit(context.companyId, "created", "leave_request", request.id, request);
  const rows = await leaveRows(context.companyId);
  const row = rows.find((item) => item.request.id === request.id)!;
  res.status(201).json(CreateLeaveRequestResponse.parse({
    id: request.id,
    employee: requestEmployeeReference(row.employee, row.department.name),
    type: request.type,
    from: request.from,
    to: request.to,
    days: request.days,
    reason: request.reason,
    status: "pending",
    submittedAt: request.submittedAt.toISOString(),
    decidedBy: null,
    decisionReason: null,
  }));
});

router.post("/leave/requests/:requestId/decision", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!canApprove(context.role)) {
    res.status(403).json({ error: "You do not have permission to decide leave requests." });
    return;
  }
  const params = DecideLeaveRequestParams.safeParse(req.params);
  const parsed = DecideLeaveRequestBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [request] = await db.update(leaveRequestsTable).set({
    status: parsed.data.decision,
    decidedBy: context.role === "manager" ? "Team manager" : "Company owner",
    decisionReason: parsed.data.reason || null,
    decidedAt: new Date(),
  }).where(and(eq(leaveRequestsTable.id, params.data.requestId), eq(leaveRequestsTable.companyId, context.companyId))).returning();
  if (!request) {
    res.status(404).json({ error: "Leave request not found." });
    return;
  }
  await recordAudit(context.companyId, parsed.data.decision, "leave_request", request.id, parsed.data);
  const rows = await leaveRows(context.companyId);
  const row = rows.find((item) => item.request.id === request.id)!;
  res.json(DecideLeaveRequestResponse.parse({
    id: request.id,
    employee: requestEmployeeReference(row.employee, row.department.name),
    type: request.type,
    from: request.from,
    to: request.to,
    days: request.days,
    reason: request.reason,
    status: request.status,
    submittedAt: request.submittedAt.toISOString(),
    decidedBy: request.decidedBy,
    decisionReason: request.decisionReason,
  }));
});

router.get("/permissions/requests", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const rows = await permissionRows(context.companyId);
  const visible = context.role === "employee"
    ? rows.filter((row) => row.request.employeeId === context.employeeId)
    : rows;
  res.json(ListPermissionRequestsResponse.parse(visible.map((row) => ({
    id: row.request.id,
    employee: requestEmployeeReference(row.employee, row.department.name),
    type: row.request.type,
    date: row.request.date,
    startTime: row.request.startTime,
    endTime: row.request.endTime,
    reason: row.request.reason,
    status: row.request.status as "pending" | "approved" | "rejected" | "cancelled",
    submittedAt: row.request.submittedAt.toISOString(),
    decisionReason: row.request.decisionReason,
  }))));
});

router.post("/permissions/requests", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!context.employeeId) {
    res.status(400).json({ error: "No active employee context is available." });
    return;
  }
  const parsed = CreatePermissionRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [request] = await db.insert(permissionRequestsTable).values({
    companyId: context.companyId,
    employeeId: context.employeeId,
    type: parsed.data.type,
    date: calendarDate(parsed.data.date)!,
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    reason: parsed.data.reason,
  }).returning();
  await recordAudit(context.companyId, "created", "permission_request", request.id, request);
  const rows = await permissionRows(context.companyId);
  const row = rows.find((item) => item.request.id === request.id)!;
  res.status(201).json(CreatePermissionRequestResponse.parse({
    id: request.id,
    employee: requestEmployeeReference(row.employee, row.department.name),
    type: request.type,
    date: request.date,
    startTime: request.startTime,
    endTime: request.endTime,
    reason: request.reason,
    status: "pending",
    submittedAt: request.submittedAt.toISOString(),
    decisionReason: null,
  }));
});

router.post("/permissions/requests/:requestId/decision", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!canApprove(context.role)) {
    res.status(403).json({ error: "You do not have permission to decide permission requests." });
    return;
  }
  const params = DecidePermissionRequestParams.safeParse(req.params);
  const parsed = DecidePermissionRequestBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [request] = await db.update(permissionRequestsTable).set({
    status: parsed.data.decision,
    decisionReason: parsed.data.reason || null,
    decidedAt: new Date(),
  }).where(and(eq(permissionRequestsTable.id, params.data.requestId), eq(permissionRequestsTable.companyId, context.companyId))).returning();
  if (!request) {
    res.status(404).json({ error: "Permission request not found." });
    return;
  }
  await recordAudit(context.companyId, parsed.data.decision, "permission_request", request.id, parsed.data);
  const rows = await permissionRows(context.companyId);
  const row = rows.find((item) => item.request.id === request.id)!;
  res.json(DecidePermissionRequestResponse.parse({
    id: request.id,
    employee: requestEmployeeReference(row.employee, row.department.name),
    type: request.type,
    date: request.date,
    startTime: request.startTime,
    endTime: request.endTime,
    reason: request.reason,
    status: request.status,
    submittedAt: request.submittedAt.toISOString(),
    decisionReason: request.decisionReason,
  }));
});

router.get("/rules", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const [rules] = await db.select().from(attendanceRulesTable).where(eq(attendanceRulesTable.companyId, context.companyId)).limit(1);
  const response = rules ?? {
    workStart: "09:00",
    workEnd: "17:00",
    graceMinutes: 10,
    overtimeAfterMinutes: 30,
    workingDays: ["Sun", "Mon", "Tue", "Wed", "Thu"],
    gpsPolicy: "optional",
    locationRadiusMeters: 180,
    version: 1,
    effectiveFrom: TODAY,
  };
  res.json(GetAttendanceRulesResponse.parse(response));
});

router.put("/rules", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!canManageCompany(context.role)) {
    res.status(403).json({ error: "You do not have permission to update attendance rules." });
    return;
  }
  const parsed = UpdateAttendanceRulesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(attendanceRulesTable).where(eq(attendanceRulesTable.companyId, context.companyId)).limit(1);
  const [rules] = existing
    ? await db.update(attendanceRulesTable).set({
        ...parsed.data,
        version: existing.version + 1,
        updatedAt: new Date(),
      }).where(eq(attendanceRulesTable.id, existing.id)).returning()
    : await db.insert(attendanceRulesTable).values({
        companyId: context.companyId,
        ...parsed.data,
        version: 1,
        effectiveFrom: TODAY,
      }).returning();
  await recordAudit(context.companyId, "updated", "attendance_rules", rules.id, parsed.data);
  res.json(UpdateAttendanceRulesResponse.parse(rules));
});

router.get("/reports/attendance", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const query = GetAttendanceReportQueryParams.safeParse({
    ...req.query,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const from = calendarDate(query.data.from) ?? "2026-08-01";
  const to = calendarDate(query.data.to) ?? TODAY;
  const rows = await getAttendanceRows(context.companyId, from, to);
  const grouped = new Map<string, {
    employee: ReturnType<typeof employeeReference>;
    presentDays: number;
    lateDays: number;
    absentDays: number;
    overtimeHours: number;
    workedHours: number;
  }>();
  for (const row of rows) {
    const current = grouped.get(row.employee.id) ?? {
      employee: employeeReference(row.employee, row.department.name),
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
      overtimeHours: 0,
      workedHours: 0,
    };
    if (row.attendance.status === "present") current.presentDays += 1;
    if (row.attendance.status === "late") current.lateDays += 1;
    if (row.attendance.status === "absent") current.absentDays += 1;
    current.overtimeHours += row.attendance.overtimeHours;
    current.workedHours += row.attendance.workedHours;
    grouped.set(row.employee.id, current);
  }
  const response = {
    from,
    to,
    totals: {
      present: rows.filter((row) => row.attendance.status === "present").length,
      late: rows.filter((row) => row.attendance.status === "late").length,
      absent: rows.filter((row) => row.attendance.status === "absent").length,
      onLeave: rows.filter((row) => row.attendance.status === "on_leave").length,
      overtimeHours: rows.reduce((total, row) => total + row.attendance.overtimeHours, 0),
    },
    rows: [...grouped.values()],
  };
  res.json(GetAttendanceReportResponse.parse(response));
});

router.get("/payroll/periods", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const periods = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.companyId, context.companyId)).orderBy(desc(payrollPeriodsTable.to));
  res.json(ListPayrollPeriodsResponse.parse(periods));
});

router.post("/payroll/periods/:periodId/calculate", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!canManageCompany(context.role)) {
    res.status(403).json({ error: "You do not have permission to calculate payroll." });
    return;
  }
  const params = CalculatePayrollParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [period] = await db.select().from(payrollPeriodsTable).where(and(eq(payrollPeriodsTable.id, params.data.periodId), eq(payrollPeriodsTable.companyId, context.companyId))).limit(1);
  if (!period) {
    res.status(404).json({ error: "Payroll period not found." });
    return;
  }
  const rows = (await employeeRows(context.companyId)).filter((row) => row.employee.status === "active");
  const attendance = await getAttendanceRows(context.companyId, period.from, period.to);
  const items = [];
  for (const row of rows) {
    const employeeAttendance = attendance.filter((attendanceRow) => attendanceRow.employee.id === row.employee.id);
    const overtimeHours = employeeAttendance.reduce((total, item) => total + item.attendance.overtimeHours, 0);
    const lateMinutes = employeeAttendance.reduce((total, item) => total + item.attendance.lateMinutes, 0);
    const hourlyRate = row.employee.salary / 160;
    const overtime = Number((overtimeHours * hourlyRate * 1.25).toFixed(2));
    const attendanceDeductions = Number(((lateMinutes / 60) * hourlyRate * 0.5).toFixed(2));
    const additions = 0;
    const otherDeductions = 0;
    const netSalary = Number((row.employee.salary + additions + overtime - attendanceDeductions - otherDeductions).toFixed(2));
    const lineItems = [
      { label: "Basic salary", amount: row.employee.salary, type: "basic" as const, explanation: "Employee compensation profile." },
      { label: "Overtime", amount: overtime, type: "overtime" as const, explanation: `${overtimeHours.toFixed(2)} hours × hourly rate × 1.25 general overtime factor.` },
      { label: "Attendance deductions", amount: -attendanceDeductions, type: "attendance_deduction" as const, explanation: `${lateMinutes} late minutes × hourly rate × 0.5 general deduction factor.` },
    ];
    const [calculation] = await db.insert(payrollCalculationsTable).values({
      companyId: context.companyId,
      periodId: period.id,
      employeeId: row.employee.id,
      basicSalary: row.employee.salary,
      additions,
      overtime,
      attendanceDeductions,
      otherDeductions,
      netSalary,
      lineItems,
      calculationVersion: 1,
    }).returning();
    items.push({
      employee: employeeReference(row.employee, row.department.name),
      basicSalary: calculation.basicSalary,
      additions: calculation.additions,
      overtime: calculation.overtime,
      attendanceDeductions: calculation.attendanceDeductions,
      otherDeductions: calculation.otherDeductions,
      netSalary: calculation.netSalary,
      lineItems,
    });
  }
  const totals = items.reduce((total, item) => ({
    basicSalary: total.basicSalary + item.basicSalary,
    additions: total.additions + item.additions,
    overtime: total.overtime + item.overtime,
    attendanceDeductions: total.attendanceDeductions + item.attendanceDeductions,
    otherDeductions: total.otherDeductions + item.otherDeductions,
    netSalary: total.netSalary + item.netSalary,
  }), { basicSalary: 0, additions: 0, overtime: 0, attendanceDeductions: 0, otherDeductions: 0, netSalary: 0 });
  await db.update(payrollPeriodsTable).set({ status: "calculated", employeeCount: items.length, totalNet: totals.netSalary, calculatedAt: new Date() }).where(eq(payrollPeriodsTable.id, period.id));
  await recordAudit(context.companyId, "calculated", "payroll_period", period.id, { calculationVersion: 1, employeeCount: items.length });
  res.json({
    period: { ...period, status: "calculated", employeeCount: items.length, totalNet: totals.netSalary },
    calculatedAt: new Date().toISOString(),
    items,
    totals,
    explanation: "This general payroll foundation intentionally excludes country-specific tax, insurance, and statutory calculations.",
  });
});

router.get("/devices", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const rows = await db.select({ device: devicesTable, branch: branchesTable }).from(devicesTable).innerJoin(branchesTable, eq(devicesTable.branchId, branchesTable.id)).where(eq(devicesTable.companyId, context.companyId));
  res.json(ListDevicesResponse.parse(rows.map((row) => ({
    id: row.device.id,
    name: row.device.name,
    manufacturer: row.device.manufacturer,
    model: row.device.model,
    branch: row.branch.name,
    status: row.device.status as "connected" | "attention" | "offline" | "not_configured",
    lastSync: row.device.lastSync ? row.device.lastSync.toISOString() : null,
    integrationState: row.device.integrationState as "adapter_pending" | "configured" | "syncing" | "unavailable",
    note: row.device.note,
  }))));
});

router.post("/devices", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (!canManageCompany(context.role)) {
    res.status(403).json({ error: "You do not have permission to manage devices." });
    return;
  }
  const parsed = CreateDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [branch] = await db.select().from(branchesTable).where(and(eq(branchesTable.id, parsed.data.branchId), eq(branchesTable.companyId, context.companyId))).limit(1);
  if (!branch) {
    res.status(400).json({ error: "Branch not found in the active company." });
    return;
  }
  const [device] = await db.insert(devicesTable).values({
    companyId: context.companyId,
    name: parsed.data.name,
    manufacturer: parsed.data.manufacturer,
    model: parsed.data.model,
    branchId: branch.id,
    status: "not_configured",
    integrationState: "adapter_pending",
    note: "Hardware connector is not configured. No attendance sync is being simulated.",
  }).returning();
  await recordAudit(context.companyId, "created", "device", device.id, device);
  res.status(201).json(CreateDeviceResponse.parse({
    id: device.id,
    name: device.name,
    manufacturer: device.manufacturer,
    model: device.model,
    branch: branch.name,
    status: "not_configured",
    lastSync: null,
    integrationState: "adapter_pending",
    note: device.note,
  }));
});

router.post("/devices/:deviceId/sync", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const params = SyncDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [device] = await db.select().from(devicesTable).where(and(eq(devicesTable.id, params.data.deviceId), eq(devicesTable.companyId, context.companyId))).limit(1);
  if (!device) {
    res.status(404).json({ error: "Device not found." });
    return;
  }
  res.status(202).json(SyncDeviceResponse.parse({
    deviceId: device.id,
    status: "unavailable",
    message: "No manufacturer adapter is configured for this device yet. No synchronization was attempted.",
  }));
});

router.get("/subscription", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  const [row] = await db.select({ subscription: subscriptionsTable, plan: plansTable }).from(subscriptionsTable).innerJoin(plansTable, eq(subscriptionsTable.planId, plansTable.id)).where(eq(subscriptionsTable.companyId, context.companyId)).limit(1);
  const activeEmployees = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(eq(employeesTable.companyId, context.companyId), eq(employeesTable.status, "active")));
  res.json(GetSubscriptionResponse.parse({
    planName: row?.plan.name ?? "Unconfigured",
    status: (row?.subscription.status ?? "trial") as "trial" | "active" | "past_due" | "cancelled",
    activeEmployees: activeEmployees.length,
    employeeLimit: row?.plan.employeeLimit ?? 0,
    features: row?.plan.features ?? [],
  }));
});

router.get("/platform/companies", async (req, res): Promise<void> => {
  const context = await getTenantContext(req);
  if (context.role !== "platform_owner") {
    res.status(403).json({ error: "Platform administration requires the platform owner role." });
    return;
  }
  const companies = await db.select().from(companiesTable).orderBy(asc(companiesTable.name));
  const rows = [];
  for (const company of companies) {
    const [subscription] = await db.select({ subscription: subscriptionsTable, plan: plansTable }).from(subscriptionsTable).innerJoin(plansTable, eq(subscriptionsTable.planId, plansTable.id)).where(eq(subscriptionsTable.companyId, company.id)).limit(1);
    const activeEmployees = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(eq(employeesTable.companyId, company.id), eq(employeesTable.status, "active")));
    rows.push({
      id: company.id,
      name: company.name,
      status: subscription?.subscription.status === "active" ? "active" : "trial",
      planName: subscription?.plan.name ?? "Unconfigured",
      activeEmployees: activeEmployees.length,
      employeeLimit: subscription?.plan.employeeLimit ?? 0,
      lastActivity: company.createdAt.toISOString(),
    });
  }
  res.json(ListPlatformCompaniesResponse.parse(rows));
});

export default router;