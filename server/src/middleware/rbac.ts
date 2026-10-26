import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/index.js';

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
