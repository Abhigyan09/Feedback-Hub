import { Request, Response, NextFunction } from 'express';
import { UserRole, PermissionKey } from '../types/index.js';
import { tenantStore } from '../config/db.js';

export const ALL_ROLES: UserRole[] = [
  'super_admin',
  'tenant_admin',
  'squad_lead',
  'developer',
  'support_agent',
  'client_user'
];

export const ADMIN_ROLES: UserRole[] = ['super_admin', 'tenant_admin'];
export const DEV_ROLES: UserRole[] = ['super_admin', 'tenant_admin', 'squad_lead', 'developer'];
export const INTERNAL_ROLES: UserRole[] = ['super_admin', 'tenant_admin', 'squad_lead', 'developer', 'support_agent'];

/**
 * Reusable Role-Based Access Control (RBAC) middleware for Express routes.
 * 
 * Enforces role permissions exclusively from verified JWT claims (`req.auth.role`).
 * Client-supplied headers (x-user-role), request bodies, or query parameters are NEVER trusted.
 * 
 * Behavior:
 * - If req.auth is missing (unauthenticated) -> Returns HTTP 401 Unauthorized (AUTH_REQUIRED).
 * - If req.auth.role is not in allowedRoles -> Returns HTTP 403 Forbidden (FORBIDDEN).
 * - If req.auth.role is permitted -> Calls next().
 */
export const requireRole = (allowedRoles: UserRole | UserRole[]) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Verify authentication context is present
    if (!req.auth) {
      return res.status(401).json({
        error: 'Authentication Required',
        code: 'AUTH_REQUIRED',
        message: 'Authentication context missing. A valid Bearer access token is required before checking authorization.'
      });
    }

    // 2. Read role exclusively from verified req.auth context
    const currentRole = req.auth.role;

    // 3. Check role authorization against allowed list
    if (!roles.includes(currentRole)) {
      return res.status(403).json({
        error: 'Access Denied: Insufficient Role Permissions',
        code: 'FORBIDDEN',
        current_role: currentRole,
        required_roles: roles,
        message: `Your current role '${currentRole}' is not permitted to perform this enterprise action.`
      });
    }

    next();
  };
};

export const requireAdmin = () => requireRole(ADMIN_ROLES);
export const requireSuperAdmin = () => requireRole(['super_admin']);
export const requireDev = () => requireRole(DEV_ROLES);
export const requireInternal = () => requireRole(INTERNAL_ROLES);

/**
 * Enforces dynamic granular permission check bound to the active tenant scope.
 */
export const requirePermission = (permissionKey: PermissionKey) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.auth?.tenantId;
    const role = req.auth?.role;

    if (!tenantId || !role) {
      return res.status(401).json({
        error: 'Unauthorized Context',
        message: 'Missing tenant authentication context for permission verification.'
      });
    }

    const isAuthorized = tenantStore.hasPermission(tenantId, role, permissionKey);

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access Denied: Missing Required Permission',
        missing_permission: permissionKey,
        current_role: role,
        tenant_id: tenantId,
        message: `Role '${role}' is not granted permission '${permissionKey}' in tenant scope '${tenantId}'.`
      });
    }

    next();
  };
};

/**
 * Enforces that the current role has AT LEAST ONE of the specified permissions.
 */
export const requireAnyPermission = (permissionKeys: PermissionKey[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.auth?.tenantId;
    const role = req.auth?.role;

    if (!tenantId || !role) {
      return res.status(401).json({
        error: 'Unauthorized Context',
        message: 'Missing tenant authentication context.'
      });
    }

    const hasAny = permissionKeys.some(key => tenantStore.hasPermission(tenantId, role, key));

    if (!hasAny) {
      return res.status(403).json({
        error: 'Access Denied: Missing Required Permissions',
        required_one_of: permissionKeys,
        current_role: role,
        tenant_id: tenantId,
        message: `Role '${role}' does not possess any of the authorized permissions: [${permissionKeys.join(', ')}].`
      });
    }

    next();
  };
};
