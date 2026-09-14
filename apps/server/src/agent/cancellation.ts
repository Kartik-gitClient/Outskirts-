export class TaskCancelledError extends Error {
  constructor(public readonly reason: string = 'Task was cancelled cooperatively') {
    super(reason);
    this.name = 'TaskCancelledError';
  }
}

export class CancellationToken {
  private _isCancelled = false;
  private _reason?: string;
  private listeners: Array<() => void> = [];

  public get isCancelled(): boolean {
    return this._isCancelled;
  }

  public get reason(): string | undefined {
    return this._reason;
  }

  public cancel(reason = 'Task cancelled cooperatively'): void {
    if (this._isCancelled) return;
    this._isCancelled = true;
    this._reason = reason;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('Cancellation listener error:', err);
      }
    }
  }

  public throwIfCancelled(): void {
    if (this._isCancelled) {
      throw new TaskCancelledError(this._reason);
    }
  }

  public onCancelled(callback: () => void): void {
    if (this._isCancelled) {
      callback();
    } else {
      this.listeners.push(callback);
    }
  }
}
