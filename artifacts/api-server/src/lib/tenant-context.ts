import { and, eq } from "drizzle-orm";
import { db, companiesTable, employeesTable } from "@workspace/db";
import type { Request } from "express";

export type WorkspaceRole = "platform_owner" | "company_owner" | "manager" | "employee";

export interface TenantContext {
  companyId: string;
  company: typeof companiesTable.$inferSelect;
  role: WorkspaceRole;
  employeeId: string | null;
}

const DEFAULT_TENANT = "northstar";

export async function getTenantContext(req: Request): Promise<TenantContext> {
  const tenantSlug =
    typeof req.header("x-var-tenant") === "string" &&
    req.header("x-var-tenant")!.trim().length > 0
      ? req.header("x-var-tenant")!.trim()
      : DEFAULT_TENANT;
  const roleHeader = req.header("x-var-role");
  const role: WorkspaceRole =
    roleHeader === "platform_owner" ||
    roleHeader === "company_owner" ||
    roleHeader === "manager" ||
    roleHeader === "employee"
      ? roleHeader
      : "company_owner";

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.slug, tenantSlug))
    .limit(1);

  if (!company) {
    throw new Error(`Tenant "${tenantSlug}" was not found`);
  }

  const employeeHeader = req.header("x-var-employee");
  const employee = employeeHeader
    ? (
        await db
          .select({ id: employeesTable.id })
          .from(employeesTable)
          .where(
            and(
              eq(employeesTable.companyId, company.id),
              eq(employeesTable.id, employeeHeader),
            ),
          )
          .limit(1)
      )[0]
    : (
        await db
          .select({ id: employeesTable.id })
          .from(employeesTable)
          .where(eq(employeesTable.companyId, company.id))
          .orderBy(employeesTable.createdAt)
          .limit(1)
      )[0];

  return {
    companyId: company.id,
    company,
    role,
    employeeId: employee?.id ?? null,
  };
}

export function canManageCompany(role: WorkspaceRole): boolean {
  return role === "company_owner" || role === "platform_owner";
}

export function canApprove(role: WorkspaceRole): boolean {
  return role === "company_owner" || role === "manager" || role === "platform_owner";
}