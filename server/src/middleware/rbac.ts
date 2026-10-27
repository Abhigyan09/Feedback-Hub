import { Request, Response, NextFunction } from 'express';
import { UserRole, PermissionKey } from '../types/index.js';
import { tenantStore } from '../config/db.js';

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const currentRole = req.auth?.role;
    if (!currentRole || !allowedRoles.includes(currentRole)) {
      return res.status(403).json({
        error: 'Access Denied: Insufficient Role Permissions',
        current_role: currentRole,
        required_roles: allowedRoles,
        message: `Your current role '${currentRole}' is not permitted to perform this enterprise action.`
      });
    }
    next();
  };
};

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
