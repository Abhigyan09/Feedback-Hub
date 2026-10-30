import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { ENV } from '../config/env.js';
import { verifyAccessToken } from './auth.service.js';
import { validateOrigin } from '../middleware/security.js';
import { UserRole } from '../types/index.js';

export interface SocketAuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  fullName: string;
  tokenExp?: number;
}

declare module 'socket.io' {
  interface SocketData {
    auth?: SocketAuthContext;
  }
}

let ioInstance: SocketServer | null = null;

/**
 * Extracts the access JWT from the Socket.IO connection handshake.
 * Checks socket.handshake.auth.token, Authorization header, and query string fallback.
 */
function extractHandshakeToken(socket: Socket): string | null {
  // 1. Standard Socket.IO client auth payload: io(url, { auth: { token: '...' } })
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim().replace(/^Bearer\s+/i, '');
  }

  // 2. HTTP Authorization header: Bearer <token>
  const authHeader = socket.handshake.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim()) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1].trim();
    }
  }

  // 3. Query string fallback: ?token=<token>
  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim().replace(/^Bearer\s+/i, '');
  }

  return null;
}

export const initSocketServer = (server: HttpServer): SocketServer => {
  ioInstance = new SocketServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        if (validateOrigin(origin)) {
          return callback(null, origin);
        }
        const error = new Error(`CORS Error: Origin '${origin}' is not permitted by security policy.`);
        return callback(error);
      },
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  // ==============================================================================
  // 1. SOCKET.IO AUTHENTICATION MIDDLEWARE
  // Validates Bearer access JWT during connection handshake before allowing access.
  // Never trusts client-supplied query params (tenantId, role) or headers for identity.
  // ==============================================================================
  ioInstance.use((socket: Socket, next: (err?: Error) => void) => {
    const token = extractHandshakeToken(socket);

    if (!token) {
      const err = new Error('Authentication error: Missing access token');
      (err as any).data = { code: 'AUTH_TOKEN_MISSING' };
      return next(err);
    }

    try {
      const claims = verifyAccessToken(token);

      // Attach typed auth context strictly from verified JWT claims
      socket.data.auth = {
        userId: claims.sub,
        tenantId: claims.tenant_id,
        role: claims.role,
        email: claims.email,
        fullName: claims.full_name || '',
        tokenExp: claims.exp
      };

      return next();
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        const authErr = new Error('Authentication error: Token expired');
        (authErr as any).data = { code: 'TOKEN_EXPIRED' };
        return next(authErr);
      }

      if (err.name === 'JsonWebTokenError') {
        const authErr = new Error('Authentication error: Invalid token signature or payload');
        (authErr as any).data = { code: 'TOKEN_INVALID' };
        return next(authErr);
      }

      const authErr = new Error('Authentication error: Unauthorized');
      (authErr as any).data = { code: 'AUTH_FAILED' };
      return next(authErr);
    }
  });

  // ==============================================================================
  // 2. CONNECTION LIFECYCLE & TENANT ROOM ISOLATION
  // ==============================================================================
  ioInstance.on('connection', (socket: Socket) => {
    const auth = socket.data.auth;
    if (!auth) {
      socket.disconnect(true);
      return;
    }

    const { tenantId, role, userId } = auth;

    // 1. Client automatically joins their verified tenant room
    const tenantRoom = `tenant:${tenantId}`;
    socket.join(tenantRoom);

    // 2. Only internal roles join the internal developer channel for this tenant
    const devRoom = `tenant:${tenantId}:devs`;
    if (['super_admin', 'tenant_admin', 'squad_lead', 'developer', 'support_agent'].includes(role)) {
      socket.join(devRoom);
    }

    // 3. User-specific room for direct notifications
    socket.join(`user:${userId}`);

    console.log(`[WebSocket] Connected client (${role}) joined ${tenantRoom}`);

    // 4. Token lifecycle guard: check expiration before handling any client-initiated event
    socket.use(([event, ...args], next) => {
      const currentAuth = socket.data.auth;
      if (!currentAuth) {
        return next(new Error('Unauthorized'));
      }

      if (currentAuth.tokenExp && currentAuth.tokenExp <= Math.floor(Date.now() / 1000)) {
        const err = new Error('Session expired: Access token is no longer valid');
        (err as any).data = { code: 'TOKEN_EXPIRED' };
        socket.emit('auth_error', {
          code: 'TOKEN_EXPIRED',
          message: 'Access token expired. Please re-authenticate.'
        });
        socket.disconnect(true);
        return next(err);
      }

      next();
    });

    // 5. Automatic session termination timer upon token expiry
    if (auth.tokenExp) {
      const msUntilExpiry = (auth.tokenExp * 1000) - Date.now();
      if (msUntilExpiry > 0 && msUntilExpiry < 2147483647) {
        const expiryTimer = setTimeout(() => {
          socket.emit('auth_error', {
            code: 'TOKEN_EXPIRED',
            message: 'Access token expired. Disconnecting session.'
          });
          socket.disconnect(true);
        }, msUntilExpiry);

        socket.on('disconnect', () => clearTimeout(expiryTimer));
      }
    }

    // Prevent clients from arbitrarily joining rooms
    socket.on('join_room', (data: any, callback?: any) => {
      const errorMessage = 'Access Denied: Arbitrary room subscription is forbidden.';
      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      } else {
        socket.emit('error', { error: errorMessage });
      }
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  return ioInstance;
};

/**
 * Forcibly disconnects all active sockets associated with a given user ID.
 * Called immediately upon user logout or session revocation.
 */
export const disconnectUserSockets = (userId: string): void => {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).disconnectSockets(true);
};

export const getSocketServer = (): SocketServer | null => ioInstance;

export const broadcastTicketEvent = (
  tenantId: string,
  eventName: string,
  payload: any,
  isInternalOnly = false
) => {
  if (!ioInstance) return;

  if (isInternalOnly) {
    // Only dispatch to internal engineering team for this specific tenant
    ioInstance.to(`tenant:${tenantId}:devs`).emit(eventName, payload);
  } else {
    // Dispatch to everyone in the tenant room (including clients)
    ioInstance.to(`tenant:${tenantId}`).emit(eventName, payload);
  }
};

export const closeSocketServer = async (): Promise<void> => {
  if (ioInstance) {
    await new Promise<void>((resolve) => {
      ioInstance!.close(() => {
        ioInstance = null;
        resolve();
      });
    });
  }
};

