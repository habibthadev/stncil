import type { IrDocument, IrInstruction } from "@stncil/core";
import type { RenderContext } from "./context";
import { createExecutorState, exec, type ExecutorState } from "./executor";
import { createRenderPlan, joinChunks, type RuntimeOptions, type RenderChunk } from "./async";
import { prepareProgram, type RenderProgram } from "./program";

export interface RenderResult {
  readonly html: string;
  readonly errors: readonly Error[];
}

function requiresAsync(instructions: readonly IrInstruction[]): boolean {
  return instructions.some((instruction) => {
    switch (instruction.op) {
      case "ASYNC_BLOCK":
      case "PARALLEL_GROUP":
      case "LAYOUT":
      case "RENDER_PARTIAL":
      case "SLOT_TARGET":
        return true;
      case "IF":
        return (
          requiresAsync(instruction.consequent) ||
          requiresAsync(instruction.alternate ?? []) ||
          instruction.elseIfs.some((branch) => requiresAsync(branch.body))
        );
      case "EACH":
        return requiresAsync(instruction.body) || requiresAsync(instruction.empty);
      case "BOUNDARY":
        return requiresAsync(instruction.body) || requiresAsync(instruction.fallback);
      case "CACHE_BLOCK":
      case "RECURSIVE_DEF":
        return requiresAsync(instruction.body);
      default:
        return false;
    }
  });
}

export class RuntimeEngine {
  private doc: IrDocument;
  private readonly needsAsync: boolean;
  private readonly program: RenderProgram | null;

  constructor(
    doc: IrDocument,
    private readonly options: RuntimeOptions = {},
  ) {
    if (
      options.maxTemplateDepth !== undefined &&
      (!Number.isSafeInteger(options.maxTemplateDepth) || options.maxTemplateDepth < 1)
    ) {
      throw new RangeError("Template depth must be a positive safe integer");
    }
    this.doc = doc;
    this.needsAsync = requiresAsync(doc.instructions);
    this.program = prepareProgram(doc);
  }

  async renderAsync(ctx: RenderContext = {}): Promise<RenderResult> {
    if (!this.needsAsync && !this.options.signal?.aborted) return this.render(ctx);
    const controller = new AbortController();
    const abort = () => controller.abort(this.options.signal?.reason);
    this.options.signal?.addEventListener("abort", abort, { once: true });
    if (this.options.signal?.aborted) abort();
    try {
      const chunks = createRenderPlan(
        this.doc.instructions,
        ctx,
        createExecutorState(this.options),
        {
          ...this.options,
          signal: controller.signal,
          sourceFile: this.doc.sourceFile,
          templateDepth: 0,
        },
      );
      return { html: await joinChunks(chunks), errors: [] };
    } catch (error) {
      controller.abort(error);
      return { html: "", errors: [error instanceof Error ? error : new Error(String(error))] };
    } finally {
      this.options.signal?.removeEventListener("abort", abort);
    }
  }

  render(ctx: RenderContext = {}): RenderResult {
    if (this.program) return this.program.render(ctx, this.options);
    const state = createExecutorState(this.options);
    const mergedCtx: RenderContext = ctx;
    const errors: Error[] = [];

    try {
      exec(this.doc.instructions, mergedCtx, state);
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }

    return { html: state.output, errors };
  }

  renderStream(ctx: RenderContext = {}): ReadableStream<string> {
    const controller = new AbortController();
    const parentSignal = this.options.signal;
    const abort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener("abort", abort, { once: true });
    if (parentSignal?.aborted) abort();
    let chunks: Iterator<RenderChunk>;
    let finished = false;
    const dispose = () => parentSignal?.removeEventListener("abort", abort);
    return new ReadableStream({
      start: (stream) => {
        try {
          chunks = createRenderPlan(this.doc.instructions, ctx, createExecutorState(this.options), {
            ...this.options,
            signal: controller.signal,
            sourceFile: this.doc.sourceFile,
            templateDepth: 0,
          })[Symbol.iterator]();
        } catch (error) {
          finished = true;
          controller.abort(error);
          stream.error(error);
          dispose();
        }
      },
      async pull(stream) {
        try {
          controller.signal.throwIfAborted();
          const chunk = chunks.next();
          if (chunk.done) {
            finished = true;
            stream.close();
            dispose();
            return;
          }
          const value = await chunk.value;
          if (!finished) stream.enqueue(value);
        } catch (error) {
          controller.abort(error);
          if (!finished) {
            finished = true;
            stream.error(error);
          }
          dispose();
        }
      },
      cancel(reason) {
        finished = true;
        controller.abort(reason);
        dispose();
      },
    });
  }

  getDocument(): IrDocument {
    return this.doc;
  }
}

export { RuntimeEngine as Engine };
export type { RenderContext } from "./context";
export type { ExecutorState } from "./executor";
export type { Fetcher, RuntimeOptions } from "./async";
