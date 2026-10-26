import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { ENV } from '../config/env.js';

let ioInstance: SocketServer | null = null;

export const initSocketServer = (server: HttpServer): SocketServer => {
  ioInstance = new SocketServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  ioInstance.on('connection', (socket: Socket) => {
    // Client joins tenant and squad specific rooms
    const tenantId = (socket.handshake.query.tenantId as string) || 'tenant-acme-corp-001';
    const role = (socket.handshake.query.role as string) || 'developer';

    socket.join(`tenant:${tenantId}`);
    
    // Only internal roles join internal dev channel
    if (['super_admin', 'tenant_admin', 'squad_lead', 'developer', 'support_agent'].includes(role)) {
      socket.join(`tenant:${tenantId}:devs`);
    }

    console.log(`[WebSocket] Connected client (${role}) joined tenant:${tenantId}`);

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  return ioInstance;
};

export const broadcastTicketEvent = (tenantId: string, eventName: string, payload: any, isInternalOnly = false) => {
  if (!ioInstance) return;

  if (isInternalOnly) {
    // Only dispatch to internal engineering team
    ioInstance.to(`tenant:${tenantId}:devs`).emit(eventName, payload);
  } else {
    // Dispatch to everyone in the tenant including clients
    ioInstance.to(`tenant:${tenantId}`).emit(eventName, payload);
  }
};
