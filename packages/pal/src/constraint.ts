import { jsonSchemaFor } from '@outskirts/schemas';

/**
 * Turning a SchemaRef into an actual decoding constraint.
 *
 * This module exists because the mistake it prevents is invisible to the
 * compiler. `outputSchemaRef` is a string name; every provider's structured
 * output parameter wants a JSON Schema *object*. Assigning the ref directly --
 *
 *     payload.guided_json = req.outputSchemaRef;   // sends "PlanStep"
 *
 * -- type-checks perfectly, is accepted by the server as a degenerate schema or
 * silently ignored, and produces an unconstrained model that merely looks
 * constrained. Every structured output in the system then depends on the model
 * choosing to cooperate, which is the thing constrained decoding was adopted to
 * stop depending on.
 *
 * The schema returned here comes from the same converter that writes
 * build/schema/*.json, so the constraint the model is sampled into and the
 * artefact Python validates against are the same bytes.
 */

export interface OpenAiJsonSchemaFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    schema: Record<string, unknown>;
    strict: true;
  };
}

/**
 * OpenAI-compatible `response_format`, understood by vLLM, self-hosted NIM,
 * and anything else speaking that dialect. Preferred over vLLM's proprietary
 * `guided_json` precisely because it is the interoperable form -- the PAL's
 * whole purpose is that a new provider is an adapter, not a redesign.
 */
export function openAiResponseFormat(ref: string): OpenAiJsonSchemaFormat {
  return {
    type: 'json_schema',
    json_schema: { name: ref, schema: jsonSchemaFor(ref), strict: true },
  };
}

/**
 * Ollama takes the schema object directly on `format`.
 *
 * Note that `format: 'json'` -- the legacy string form -- only asks for
 * syntactically valid JSON. It does not constrain the shape, so a PlanStep[]
 * contract is not enforced by it in any way.
 */
export function ollamaFormat(ref: string): Record<string, unknown> {
  return jsonSchemaFor(ref);
}
