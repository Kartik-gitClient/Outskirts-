import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { TimelineManager } from './timeline.js';

export interface TaskWsMessage {
  type: 'subscribe' | 'ping';
  taskId?: string;
  sinceSeq?: number;
}

export class TaskWebSocketGateway {
  private wss: WebSocketServer;

  constructor(server: Server, private timeline: TimelineManager) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setup();
  }

  private setup(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      let activeUnsubscribe: (() => void) | undefined;

      // Check if URL query specified taskId and since
      const url = new URL(req.url ?? '', 'http://localhost');
      const queryTaskId = url.searchParams.get('taskId');
      const querySince = parseInt(url.searchParams.get('since') ?? '0', 10);

      const handleSubscribe = (taskId: string, sinceSeq: number) => {
        if (activeUnsubscribe) {
          activeUnsubscribe();
        }

        // 1. Replay past events since `sinceSeq`
        const replayEvents = this.timeline.getEventsSince(taskId, sinceSeq);
        for (const evt of replayEvents) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(evt));
          }
        }

        // 2. Subscribe to new real-time events
        activeUnsubscribe = this.timeline.subscribe(taskId, (evt) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(evt));
          }
        });
      };

      if (queryTaskId) {
        handleSubscribe(queryTaskId, querySince);
      }

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as TaskWsMessage;
          if (msg.type === 'subscribe' && msg.taskId) {
            handleSubscribe(msg.taskId, msg.sinceSeq ?? 0);
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', ts: new Date().toISOString() }));
          }
        } catch (err) {
          console.error('Failed to parse WS message:', err);
        }
      });

      ws.on('close', () => {
        if (activeUnsubscribe) {
          activeUnsubscribe();
        }
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => resolve());
    });
  }
}
