export interface TaskCheckpoint {
  taskId: string;
  seq: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStepId: string;
  completedSteps: string[];
  stepResults: Record<string, unknown>;
  updatedAt: string;
}

export interface Checkpointer {
  save(checkpoint: TaskCheckpoint): Promise<void>;
  get(taskId: string): Promise<TaskCheckpoint | undefined>;
  delete(taskId: string): Promise<void>;
}

export class MemoryCheckpointer implements Checkpointer {
  private store = new Map<string, TaskCheckpoint>();

  public async save(checkpoint: TaskCheckpoint): Promise<void> {
    this.store.set(checkpoint.taskId, { ...checkpoint });
  }

  public async get(taskId: string): Promise<TaskCheckpoint | undefined> {
    const cp = this.store.get(taskId);
    return cp ? { ...cp } : undefined;
  }

  public async delete(taskId: string): Promise<void> {
    this.store.delete(taskId);
  }
}
