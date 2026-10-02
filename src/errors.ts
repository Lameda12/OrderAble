import type { ErrorCode, ToolError } from "./schema.js";

/** A structured, machine-readable failure. Tools surface these as `isError` results. */
export class OrderableError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly suggestedNextTool: string | null = null,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrderableError";
  }

  toJSON(): ToolError {
    return {
      error: {
        code: this.code,
        message: this.message,
        suggested_next_tool: this.suggestedNextTool,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const isOrderableError = (e: unknown): e is OrderableError => e instanceof OrderableError;
