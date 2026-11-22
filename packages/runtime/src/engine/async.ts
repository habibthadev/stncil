import type { IrInstruction, IrDocument } from "@stncil/core";
import { evalExpr } from "./eval";
import { createExecutorState, execOne, type ExecutorState, type OutputOptions } from "./executor";
import { resolveMember, type RenderContext } from "./context";

export type Fetcher = (...args: unknown[]) => unknown | Promise<unknown>;

export interface RuntimeOptions extends OutputOptions {
  readonly fetchers?: Readonly<Record<string, Fetcher>>;
  readonly signal?: AbortSignal;
  readonly resolveTemplate?: (path: string, fromFile: string) => Promise<IrDocument>;
  readonly maxTemplateDepth?: number;
}

interface PlanOptions extends RuntimeOptions {
  readonly signal: AbortSignal;
  readonly sourceFile: string;
  readonly templateDepth: number;
  readonly slots?: ReadonlyMap<string, (depth: number) => Promise<string>>;
}

export type RenderChunk = string | Promise<string>;

function errorValue(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function awaitWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Render cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}

function cloneState(parent: ExecutorState): ExecutorState {
  const state = createExecutorState(parent.options);
  state.recursiveDefs = new Map(parent.recursiveDefs);
  state.depth = new Map(parent.depth);
  return state;
}

export async function joinChunks(chunks: readonly RenderChunk[]): Promise<string> {
  return (await Promise.all(chunks)).join("");
}

export function createRenderPlan(
  instructions: readonly IrInstruction[],
  context: RenderContext,
  state: ExecutorState,
  options: PlanOptions,
): RenderChunk[] {
  options.signal.throwIfAborted();
  const scope: RenderContext = Object.assign(Object.create(null), context);
  const chunks: RenderChunk[] = [];
  const append = (chunk: RenderChunk) => {
    // A later chunk can reject before the stream reaches its original promise.
    if (typeof chunk !== "string") void chunk.catch(() => {});
    if (chunk !== "") chunks.push(chunk);
  };
  const appendPlan = (plan: readonly RenderChunk[]) => {
    for (const chunk of plan) chunks.push(chunk);
  };

  for (const instruction of instructions) {
    switch (instruction.op) {
      case "LET":
        scope[instruction.name] = evalExpr(instruction.value, scope, options.filters);
        break;
      case "IF": {
        const branch = evalExpr(instruction.condition, scope, options.filters)
          ? instruction.consequent
          : (instruction.elseIfs.find((branch) =>
              evalExpr(branch.condition, scope, options.filters),
            )?.body ??
            instruction.alternate ??
            []);
        appendPlan(createRenderPlan(branch, scope, state, options));
        break;
      }
      case "EACH": {
        const source = evalExpr(instruction.source, scope, options.filters);
        const items = Array.isArray(source) ? source : [];
        if (items.length === 0)
          appendPlan(createRenderPlan(instruction.empty, scope, state, options));
        for (let i = 0; i < items.length; i++) {
          const child: RenderContext = {
            ...scope,
            loop: {
              index: i + 1,
              index0: i,
              first: i === 0,
              last: i === items.length - 1,
              length: items.length,
              revindex: items.length - i,
              revindex0: items.length - i - 1,
              parent: resolveMember(scope, "loop") ?? null,
            },
            [instruction.as]: resolveMember(items, i),
          };
          if (instruction.indexAs) child[instruction.indexAs] = i;
          appendPlan(createRenderPlan(instruction.body, child, state, options));
        }
        break;
      }
      case "ASYNC_BLOCK": {
        const snapshot: RenderContext = Object.assign(Object.create(null), scope);
        const childState = cloneState(state);
        const work = Promise.resolve().then(() => {
          options.signal.throwIfAborted();
          const fetcher =
            options.fetchers && Object.hasOwn(options.fetchers, instruction.fetcher)
              ? options.fetchers[instruction.fetcher]
              : undefined;
          if (typeof fetcher !== "function")
            throw new Error(`Fetcher "${instruction.fetcher}" is not registered`);
          const args = instruction.args.map((arg) => evalExpr(arg, snapshot, options.filters));
          return fetcher(...args, { signal: options.signal });
        });
        append(
          awaitWithSignal(work, options.signal)
            .then((value) =>
              joinChunks(
                createRenderPlan(
                  instruction.body,
                  { ...snapshot, [instruction.binding]: value },
                  childState,
                  options,
                ),
              ),
            )
            .catch((error) => {
              options.signal.throwIfAborted();
              if (instruction.error.length === 0) throw error;
              const fallback = instruction.errorBinding
                ? { ...snapshot, [instruction.errorBinding]: errorValue(error) }
                : snapshot;
              return joinChunks(
                createRenderPlan(instruction.error, fallback, cloneState(state), options),
              );
            }),
        );
        break;
      }
      case "PARALLEL_GROUP":
        appendPlan(createRenderPlan(instruction.blocks, scope, state, options));
        break;
      case "LAYOUT":
      case "RENDER_PARTIAL": {
        const resolver = options.resolveTemplate;
        if (!resolver) throw new Error(`No template resolver for "${instruction.template}"`);
        if (options.templateDepth >= (options.maxTemplateDepth ?? 32)) {
          throw new Error("Template composition depth limit exceeded");
        }
        const snapshot: RenderContext = Object.assign(Object.create(null), scope);
        const childState = cloneState(state);
        const props: RenderContext = Object.create(null);
        const slots = new Map<string, (depth: number) => Promise<string>>();
        if (instruction.op === "LAYOUT") {
          for (const [name, body] of Object.entries(instruction.slots)) {
            let rendered: Promise<string> | undefined;
            slots.set(
              name,
              (depth) =>
                (rendered ??= joinChunks(
                  createRenderPlan(body, snapshot, cloneState(childState), {
                    ...options,
                    templateDepth: depth,
                  }),
                )),
            );
          }
        } else {
          for (const spread of instruction.spreads ?? []) {
            const value = evalExpr(spread, snapshot, options.filters);
            if (value == null || typeof value !== "object" || Array.isArray(value)) {
              throw new TypeError("Partial prop spread requires an object");
            }
            Object.assign(props, value);
          }
          for (const [name, expr] of Object.entries(instruction.props))
            props[name] = evalExpr(expr, snapshot, options.filters);
        }
        const work = resolver(instruction.template, options.sourceFile).then((document) =>
          joinChunks(
            createRenderPlan(
              document.instructions,
              instruction.op === "LAYOUT" ? snapshot : props,
              childState,
              {
                ...options,
                sourceFile: document.sourceFile,
                templateDepth: options.templateDepth + 1,
                slots,
              },
            ),
          ),
        );
        append(awaitWithSignal(work, options.signal));
        break;
      }
      case "SLOT_TARGET": {
        const renderSlot = options.slots?.get(instruction.name);
        if (renderSlot) append(renderSlot(options.templateDepth));
        else appendPlan(createRenderPlan(instruction.defaultBody ?? [], scope, state, options));
        break;
      }
      case "BOUNDARY": {
        const fallback = (error: unknown) => {
          options.signal.throwIfAborted();
          const context = instruction.errorBinding
            ? { ...scope, [instruction.errorBinding]: errorValue(error) }
            : scope;
          return joinChunks(
            createRenderPlan(instruction.fallback, context, cloneState(state), options),
          );
        };
        try {
          append(
            joinChunks(createRenderPlan(instruction.body, scope, cloneState(state), options)).catch(
              fallback,
            ),
          );
        } catch (error) {
          append(fallback(error));
        }
        break;
      }
      case "CACHE_BLOCK":
        appendPlan(createRenderPlan(instruction.body, scope, state, options));
        break;
      case "RECURSIVE_CALL": {
        const definition = state.recursiveDefs.get(instruction.name);
        if (!definition) throw new Error(`Recursive template "${instruction.name}" is not defined`);
        const depth = state.depth.get(instruction.name) ?? 0;
        if (depth >= definition.maxDepth) break;
        state.depth.set(instruction.name, depth + 1);
        try {
          appendPlan(
            createRenderPlan(
              definition.body,
              { ...scope, [definition.param]: evalExpr(instruction.arg, scope, options.filters) },
              state,
              options,
            ),
          );
        } finally {
          state.depth.set(instruction.name, depth);
        }
        break;
      }
      default:
        state.output = "";
        execOne(instruction, scope, state);
        append(state.output);
    }
  }
  return chunks;
}
