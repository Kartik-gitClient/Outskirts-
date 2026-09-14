import http from 'node:http';
import { createServer } from './app.js';
import { TaskWebSocketGateway } from './gateway/ws-server.js';

export * from './gateway/timeline.js';
export * from './gateway/ws-server.js';
export * from './agent/checkpointer.js';
export * from './agent/cancellation.js';
export * from './agent/recipe.js';
export * from './agent/recipe-builder.js';
export * from './agent/executor.js';
export * from './provenance/c2pa.js';
export * from './critic/index.js';
export * from './review/queue.js';
export * from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

if (process.argv[1]?.endsWith('src/index.ts') || process.argv[1]?.endsWith('dist/index.js')) {
  const ctx = createServer();
  const server = http.createServer(ctx.app);
  new TaskWebSocketGateway(server, ctx.timeline);

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Outskirts Gateway] Listening on http://127.0.0.1:${PORT}`);
  });
}
