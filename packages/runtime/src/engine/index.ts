import type { IrDocument, IrInstruction } from "@stncil/core";
import type { RenderContext } from "./context";
import { createExecutorState, exec, type ExecutorState } from "./executor";

export interface RenderResult {
  readonly html: string;
  readonly errors: readonly Error[];
}

export class RuntimeEngine {
  private doc: IrDocument;

  constructor(doc: IrDocument) {
    this.doc = doc;
  }

  render(ctx: RenderContext = {}): RenderResult {
    const state = createExecutorState();
    const mergedCtx: RenderContext = { ...this.doc.context, ...ctx };
    const errors: Error[] = [];

    try {
      exec(this.doc.instructions, mergedCtx, state);
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }

    return { html: state.output, errors };
  }

  renderStream(ctx: RenderContext = {}): ReadableStream<string> {
    const doc = this.doc;
    const state = createExecutorState();
    const mergedCtx: RenderContext = { ...doc.context, ...ctx };

    return new ReadableStream({
      start(controller) {
        try {
          exec(doc.instructions, mergedCtx, state);
          controller.enqueue(state.output);
        } catch (err) {
          controller.error(err instanceof Error ? err : new Error(String(err)));
        } finally {
          controller.close();
        }
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
