import { randomUUID } from 'node:crypto';
import {
  GuardAlert,
  resolveSchema,
  type PluginRecord,
  type Seq,
} from '@outskirts/schemas';

export type ToolHandler = (input: unknown) => Promise<unknown> | unknown;
export type ToolHandlerMap = Record<string, ToolHandler>;

export class PluginExecutionError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly toolName: string,
    message: string,
  ) {
    super(`Plugin [${pluginId}:${toolName}] error: ${message}`);
    this.name = 'PluginExecutionError';
  }
}

export class PluginHost {
  private plugins = new Map<string, PluginRecord>();
  private handlers = new Map<string, ToolHandlerMap>();
  private alertListeners: Array<(alert: GuardAlert) => void> = [];
  private alertSeq = 0;

  public onAlert(listener: (alert: GuardAlert) => void): void {
    this.alertListeners.push(listener);
  }

  public registerPlugin(record: PluginRecord, handlers: ToolHandlerMap): void {
    this.plugins.set(record.manifest.id, record);
    this.handlers.set(record.manifest.id, handlers);
  }

  public getPlugin(pluginId: string): PluginRecord | undefined {
    return this.plugins.get(pluginId);
  }

  public listPlugins(): PluginRecord[] {
    return Array.from(this.plugins.values());
  }

  public setEnabled(pluginId: string, enabled: boolean): void {
    const p = this.plugins.get(pluginId);
    if (!p) throw new Error(`Plugin "${pluginId}" not found`);
    this.plugins.set(pluginId, { ...p, enabled });
  }

  /**
   * Execute a declared tool offered by an admitted and enabled plugin.
   * Enforces schema spine contract at both input and output boundaries.
   */
  public async executeTool(
    pluginId: string,
    toolName: string,
    rawInput: unknown,
  ): Promise<unknown> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginExecutionError(pluginId, toolName, 'Plugin is not registered');
    }

    if (!plugin.enabled) {
      throw new PluginExecutionError(pluginId, toolName, 'Plugin is disabled');
    }

    const toolSpec = plugin.manifest.tools.find((t) => t.name === toolName);
    if (!toolSpec) {
      throw new PluginExecutionError(
        pluginId,
        toolName,
        `Tool "${toolName}" is not declared in manifest`,
      );
    }

    const handlers = this.handlers.get(pluginId);
    const handler = handlers?.[toolName];
    if (!handler) {
      throw new PluginExecutionError(
        pluginId,
        toolName,
        `No handler registered for tool "${toolName}"`,
      );
    }

    // 1. Validate input against the Schema Spine
    const inputSchema = resolveSchema(toolSpec.inputSchemaRef);
    const inputValidation = inputSchema.safeParse(rawInput);
    if (!inputValidation.success) {
      throw new PluginExecutionError(
        pluginId,
        toolName,
        `Input failed schema "${toolSpec.inputSchemaRef}": ${inputValidation.error.message}`,
      );
    }

    // 2. Execute within capability bounds
    let rawOutput: unknown;
    try {
      rawOutput = await handler(inputValidation.data);
    } catch (err: unknown) {
      // Check if error is network attempt
      const errStr = err instanceof Error ? err.message : String(err);
      if (errStr.includes('network') || errStr.includes('socket') || errStr.includes('fetch')) {
        this.emitAlert('egress-blocked', pluginId, plugin.manifest.version, errStr);
      }
      throw new PluginExecutionError(pluginId, toolName, `Execution failed: ${errStr}`);
    }

    // 3. Validate output against Schema Spine
    const outputSchema = resolveSchema(toolSpec.outputSchemaRef);
    const outputValidation = outputSchema.safeParse(rawOutput);
    if (!outputValidation.success) {
      throw new PluginExecutionError(
        pluginId,
        toolName,
        `Output failed schema "${toolSpec.outputSchemaRef}": ${outputValidation.error.message}`,
      );
    }

    return outputValidation.data;
  }

  private emitAlert(
    kind: GuardAlert['kind'],
    pluginId: string,
    pluginVersion: string,
    detail: string,
  ): void {
    this.alertSeq++;
    const alert = GuardAlert.parse({
      alertId: `alert-${randomUUID().slice(0, 8)}`,
      seq: this.alertSeq as Seq,
      ts: new Date().toISOString(),
      kind,
      pluginId,
      pluginVersion,
      detail,
    });
    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch {
        // ignore
      }
    }
  }
}
