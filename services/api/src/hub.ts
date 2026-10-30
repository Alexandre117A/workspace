import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

/** Point de diffusion temps réel (alimenté par la passerelle Socket.IO). */
@Injectable()
export class Hub {
  server: Server | null = null;

  static session(id: string) {
    return `s:${id}`;
  }
  static actor(id: string, actor: string) {
    return `s:${id}:a:${actor}`;
  }
  static president(id: string) {
    return `s:${id}:pres`;
  }
  static participant(id: string, pid: string) {
    return `s:${id}:p:${pid}`;
  }

  emit(room: string, event: string, payload: unknown) {
    this.server?.to(room).emit(event, payload);
  }

  /** Fait rejoindre (ou quitter) un salon à toutes les sockets d'un autre salon. */
  join(fromRoom: string, toRoom: string) {
    this.server?.in(fromRoom).socketsJoin(toRoom);
  }

  leave(fromRoom: string, toRoom: string) {
    this.server?.in(fromRoom).socketsLeave(toRoom);
  }

  async connectedParticipantIds(sessionId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    if (!this.server) return ids;
    const sockets = await this.server.in(Hub.session(sessionId)).fetchSockets();
    for (const s of sockets) if (s.data?.participantId) ids.add(s.data.participantId);
    return ids;
  }
}
