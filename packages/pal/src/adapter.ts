import type {
  ChatRequest,
  HealthReport,
  Locality,
  ProviderCapability,
  ProviderId,
  RegistryEntry,
  TrustBoundary,
} from '@outskirts/schemas';

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  role: 'assistant';
  toolCalls?: ToolCallResult[];
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  loadMs: number;
}

export interface StreamChunk {
  contentChunk: string;
  done: boolean;
  toolCallChunk?: Partial<ToolCallResult>;
  tokensIn?: number;
  tokensOut?: number;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly locality: Locality;
  readonly trustBoundary: TrustBoundary;
  readonly endpointHost: string;
  capabilities: ProviderCapability[];

  chat(req: ChatRequest, model: RegistryEntry): Promise<ChatResponse>;
  stream(req: ChatRequest, model: RegistryEntry): AsyncIterable<StreamChunk>;
  health(): Promise<HealthReport>;
}
