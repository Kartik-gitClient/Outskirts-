import { ServerEvent, type Id, type Seq } from '@outskirts/schemas';

export type EventBroadcaster = (event: ServerEvent) => void;

export class TimelineManager {
  private taskEvents = new Map<string, ServerEvent[]>();
  private taskSequences = new Map<string, number>();
  private subscribers = new Map<string, Set<EventBroadcaster>>();

  public subscribe(taskId: string, listener: EventBroadcaster): () => void {
    if (!this.subscribers.has(taskId)) {
      this.subscribers.set(taskId, new Set());
    }
    this.subscribers.get(taskId)!.add(listener);

    return () => {
      this.subscribers.get(taskId)?.delete(listener);
    };
  }

  public emit(
    taskId: Id,
    eventWithoutMeta: Record<string, unknown> & { type: string },
  ): ServerEvent {
    const currentSeq = (this.taskSequences.get(taskId) ?? 0) + 1;
    this.taskSequences.set(taskId, currentSeq);

    const candidate = {
      ...eventWithoutMeta,
      taskId,
      seq: currentSeq as Seq,
      ts: new Date().toISOString(),
    };

    const validated = ServerEvent.parse(candidate);

    if (!this.taskEvents.has(taskId)) {
      this.taskEvents.set(taskId, []);
    }
    this.taskEvents.get(taskId)!.push(validated);

    // Broadcast to active task listeners
    const listeners = this.subscribers.get(taskId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(validated);
        } catch (err) {
          console.error('Timeline broadcaster error:', err);
        }
      }
    }

    return validated;
  }

  public getEventsSince(taskId: string, sinceSeq: number): ServerEvent[] {
    const events = this.taskEvents.get(taskId) ?? [];
    return events.filter((e) => e.seq > sinceSeq);
  }

  public getAllEvents(taskId: string): ServerEvent[] {
    return [...(this.taskEvents.get(taskId) ?? [])];
  }

  public getLatestSeq(taskId: string): number {
    return this.taskSequences.get(taskId) ?? 0;
  }
}
