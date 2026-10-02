import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { OrderableError } from "../errors.js";
import type { OrderableService } from "../service.js";

export interface ToolDef<I extends z.ZodRawShape, O extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: I;
  output: O;
  annotations: ToolAnnotations;
  run: (service: OrderableService, args: z.infer<z.ZodObject<I>>) => Promise<z.infer<z.ZodObject<O>>>;
}

export const defineTool = <I extends z.ZodRawShape, O extends z.ZodRawShape>(def: ToolDef<I, O>) => def;

export const nextStep = { next_step: z.string().describe("What the agent should do next") };

export function toResult(payload: unknown, isError = false): CallToolResult {
  // Errors go in text content only: some clients validate structuredContent against the
  // success outputSchema even when isError is set, and would reject the error payload.
  if (isError) return { content: [{ type: "text", text: JSON.stringify(payload) }], isError: true };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export async function runTool<I extends z.ZodRawShape, O extends z.ZodRawShape>(
  def: ToolDef<I, O>,
  service: OrderableService,
  args: z.infer<z.ZodObject<I>>,
): Promise<CallToolResult> {
  try {
    return toResult(await def.run(service, args));
  } catch (e) {
    if (e instanceof OrderableError) return toResult(e.toJSON(), true);
    const message = e instanceof Error ? e.message : String(e);
    return toResult(new OrderableError("ADAPTER_ERROR", message).toJSON(), true);
  }
}

export function registerTool<I extends z.ZodRawShape, O extends z.ZodRawShape>(
  server: McpServer,
  service: OrderableService,
  def: ToolDef<I, O>,
) {
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input,
      outputSchema: def.output,
      annotations: def.annotations,
    },
    // The SDK has already validated args against def.input.
    ((args: z.infer<z.ZodObject<I>>) => runTool(def, service, args)) as never,
  );
}
