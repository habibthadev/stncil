import type { IrDocument, IrExpr, IrFilter, IrInstruction } from "@stncil/core";
import type { RenderContext } from "./context";
import { resolveMember } from "./context";
import { arithmeticNumber, evalBinary } from "./eval";
import type { OutputOptions } from "./executor";
import { escapeHtml } from "../escape/html";
import { escapeUrl, validateUrl } from "../escape/url";
import { escapeCss } from "../escape/css";
import { escapeJs } from "../escape/js";
import { resolveFilter } from "../filters";

interface Frame {
  context: RenderContext;
  values: unknown[];
  options: OutputOptions;
  output: string;
}

type Read = (frame: Frame) => unknown;
type Write = (frame: Frame) => string;
type Step = (frame: Frame) => void;
type Bindings = ReadonlyMap<string, number>;

interface Preparation {
  slots: number;
  used: Set<number>;
  wholeContext: boolean;
}

export interface RenderProgram {
  render(context: RenderContext, options: OutputOptions): { html: string; errors: Error[] };
}

const programs = new WeakMap<IrDocument, RenderProgram | null>();

function supported(instructions: readonly IrInstruction[]): boolean {
  return instructions.every((instruction) => {
    switch (instruction.op) {
      case "ASYNC_BLOCK":
      case "PARALLEL_GROUP":
      case "LAYOUT":
      case "SLOT_TARGET":
      case "RENDER_PARTIAL":
      case "RECURSIVE_DEF":
      case "RECURSIVE_CALL":
        return false;
      case "IF":
        return (
          supported(instruction.consequent) &&
          supported(instruction.alternate ?? []) &&
          instruction.elseIfs.every((branch) => supported(branch.body))
        );
      case "EACH":
        return supported(instruction.body) && supported(instruction.empty);
      case "BOUNDARY":
        return supported(instruction.body) && supported(instruction.fallback);
      case "CACHE_BLOCK":
        return supported(instruction.body);
      default:
        return true;
    }
  });
}

function path(segments: readonly string[], bindings: Bindings, preparation: Preparation): Read {
  const name = segments[0];
  if (name === undefined) {
    preparation.wholeContext = true;
    return (frame) => frame.context;
  }
  const slot = bindings.get(name);
  if (slot !== undefined) preparation.used.add(slot);
  const first: Read =
    slot === undefined
      ? (frame) => (Object.hasOwn(frame.context, name) ? frame.context[name] : undefined)
      : (frame) => frame.values[slot];
  if (segments.length === 1) return first;
  const tail = segments.slice(1);
  return (frame) => {
    let value = first(frame);
    for (const key of tail) value = resolveMember(value, key);
    return value;
  };
}

function filtered(
  value: Read,
  filters: readonly IrFilter[],
  bindings: Bindings,
  preparation: Preparation,
): Read {
  const chain = filters.map((filter) => ({
    name: filter.name,
    args: filter.args.map((arg) => expression(arg, bindings, preparation)),
  }));
  return (frame) => {
    let result = value(frame);
    for (const filter of chain) {
      const fn = resolveFilter(filter.name, frame.options.filters);
      const args = filter.args.map((read) => read(frame));
      result = fn(result, ...args);
    }
    return result;
  };
}

function expression(expr: IrExpr, bindings: Bindings, preparation: Preparation): Read {
  switch (expr.kind) {
    case "path":
      return path(expr.segments, bindings, preparation);
    case "string":
    case "number":
    case "boolean": {
      const value = expr.value;
      return () => value;
    }
    case "null":
      return () => null;
    case "binary": {
      const left = expression(expr.left, bindings, preparation);
      const right = expression(expr.right, bindings, preparation);
      const op = expr.op;
      if (op === "&&") return (frame) => Boolean(left(frame)) && Boolean(right(frame));
      if (op === "||") return (frame) => Boolean(left(frame)) || Boolean(right(frame));
      return (frame) => evalBinary(op, left(frame), right(frame));
    }
    case "unary": {
      const operand = expression(expr.operand, bindings, preparation);
      return expr.op === "-"
        ? (frame) => -arithmeticNumber(operand(frame))
        : (frame) => !operand(frame);
    }
    case "ternary": {
      const condition = expression(expr.condition, bindings, preparation);
      const consequent = expression(expr.consequent, bindings, preparation);
      const alternate = expression(expr.alternate, bindings, preparation);
      return (frame) => (condition(frame) ? consequent(frame) : alternate(frame));
    }
    case "filter_chain":
      return filtered(
        expression(expr.expr, bindings, preparation),
        expr.filters,
        bindings,
        preparation,
      );
    case "array": {
      const items = expr.items.map((item) => expression(item, bindings, preparation));
      return (frame) => items.map((read) => read(frame));
    }
    case "object": {
      const fields = expr.fields.map((field) => ({
        name: field.name,
        read: expression(field.value, bindings, preparation),
      }));
      return (frame) => Object.fromEntries(fields.map((field) => [field.name, field.read(frame)]));
    }
    case "index": {
      const object = expression(expr.object, bindings, preparation);
      const key = expression(expr.key, bindings, preparation);
      return (frame) => resolveMember(object(frame), key(frame));
    }
  }
}

function text(value: Read, escape: (value: unknown) => string): Write {
  return (frame) => escape(value(frame));
}

function raw(value: unknown): string {
  return value == null ? "" : String(value);
}

function block(
  instructions: readonly IrInstruction[],
  parent: Bindings,
  preparation: Preparation,
): Step {
  const bindings = new Map(parent);
  const steps: Step[] = [];
  let parts: (string | Write)[] = [];
  const flush = () => {
    if (parts.length === 0) return;
    const pending = parts;
    parts = [];
    if (pending.length === 1 && typeof pending[0] === "string") {
      const literal = pending[0];
      steps.push((frame) => {
        frame.output += literal;
      });
    } else if (
      pending.length === 3 &&
      typeof pending[0] === "string" &&
      typeof pending[1] === "function" &&
      typeof pending[2] === "string"
    ) {
      const [before, read, after] = pending as [string, Write, string];
      steps.push((frame) => {
        frame.output += before;
        frame.output += read(frame);
        frame.output += after;
      });
    } else {
      steps.push((frame) => {
        for (const part of pending) frame.output += typeof part === "string" ? part : part(frame);
      });
    }
  };

  for (const instruction of instructions) {
    let write: string | Write | undefined;
    switch (instruction.op) {
      case "WRITE_LITERAL":
        write = instruction.value;
        break;
      case "WRITE_ESCAPED":
        write = text(path(instruction.path, bindings, preparation), escapeHtml);
        break;
      case "WRITE_TRUSTED":
        write = text(path(instruction.path, bindings, preparation), raw);
        break;
      case "WRITE_URL_ESCAPED":
        write = text(path(instruction.path, bindings, preparation), escapeUrl);
        break;
      case "WRITE_CSS_ESCAPED":
        write = text(path(instruction.path, bindings, preparation), escapeCss);
        break;
      case "WRITE_FILTER":
        write = text(
          filtered(
            path(instruction.path, bindings, preparation),
            instruction.filters,
            bindings,
            preparation,
          ),
          escapeHtml,
        );
        break;
      case "WRITE_EXPRESSION":
        write = text(
          expression(instruction.expr, bindings, preparation),
          instruction.escape === "raw" ? raw : escapeHtml,
        );
        break;
      case "WRITE_JSON":
        write = text(
          instruction.expr
            ? expression(instruction.expr, bindings, preparation)
            : path(instruction.path, bindings, preparation),
          escapeJs,
        );
        break;
      case "WRITE_NONCE":
        write = (frame) => {
          if (!frame.options.nonce) throw new Error("CSP nonce is not provided");
          return escapeHtml(frame.options.nonce);
        };
        break;
      case "WRITE_ASSET": {
        const asset = instruction.path;
        write = (frame) => {
          if (frame.options.assetManifest && !Object.hasOwn(frame.options.assetManifest, asset))
            throw new Error(`Asset "${asset}" is not in the manifest`);
          return escapeHtml(validateUrl(frame.options.assetManifest?.[asset] ?? asset));
        };
        break;
      }
      case "CSRF":
        write = (frame) => {
          if (!frame.options.csrfToken) throw new Error("CSRF token is not provided");
          return `<input type="hidden" name="_csrf" value="${escapeHtml(frame.options.csrfToken)}">`;
        };
        break;
      case "STYLE_BLOCK":
        write = `<style>${instruction.css}</style>`;
        break;
      case "LET": {
        flush();
        const read = expression(instruction.value, bindings, preparation);
        const slot = preparation.slots++;
        bindings.set(instruction.name, slot);
        steps.push((frame) => {
          frame.values[slot] = read(frame);
        });
        break;
      }
      case "IF": {
        flush();
        const condition = expression(instruction.condition, bindings, preparation);
        const consequent = block(instruction.consequent, bindings, preparation);
        const alternate = block(instruction.alternate ?? [], bindings, preparation);
        const branches = instruction.elseIfs.map((branch) => ({
          condition: expression(branch.condition, bindings, preparation),
          body: block(branch.body, bindings, preparation),
        }));
        steps.push((frame) => {
          if (condition(frame)) {
            consequent(frame);
            return;
          }
          for (const branch of branches)
            if (branch.condition(frame)) {
              branch.body(frame);
              return;
            }
          alternate(frame);
        });
        break;
      }
      case "EACH": {
        flush();
        const source = expression(instruction.source, bindings, preparation);
        const empty = block(instruction.empty, bindings, preparation);
        const child = new Map(bindings);
        const metadata = preparation.slots++;
        const item = preparation.slots++;
        const index = instruction.indexAs ? preparation.slots++ : undefined;
        child.set("loop", metadata);
        child.set(instruction.as, item);
        if (instruction.indexAs && index !== undefined) child.set(instruction.indexAs, index);
        const body = block(instruction.body, child, preparation);
        const loop = preparation.used.has(metadata)
          ? path(["loop"], bindings, preparation)
          : undefined;
        steps.push((frame) => {
          const value = source(frame);
          const items = Array.isArray(value) ? value : [];
          if (items.length === 0) {
            empty(frame);
            return;
          }
          for (let i = 0; i < items.length; i++) {
            if (loop)
              frame.values[metadata] = {
                index: i + 1,
                index0: i,
                first: i === 0,
                last: i === items.length - 1,
                length: items.length,
                revindex: items.length - i,
                revindex0: items.length - i - 1,
                parent: loop(frame) ?? null,
              };
            frame.values[item] = resolveMember(items, i);
            if (index !== undefined) frame.values[index] = i;
            body(frame);
          }
        });
        break;
      }
      case "BOUNDARY": {
        flush();
        const body = block(instruction.body, bindings, preparation);
        const child = new Map(bindings);
        const error = instruction.errorBinding ? preparation.slots++ : undefined;
        if (instruction.errorBinding && error !== undefined)
          child.set(instruction.errorBinding, error);
        const fallback = block(instruction.fallback, child, preparation);
        steps.push((frame) => {
          const output = frame.output;
          try {
            body(frame);
          } catch (value) {
            frame.output = output;
            if (error !== undefined) frame.values[error] = value;
            fallback(frame);
          }
        });
        break;
      }
      case "CACHE_BLOCK":
        flush();
        steps.push(block(instruction.body, bindings, preparation));
        break;
    }
    if (write !== undefined) {
      if (typeof write === "string" && typeof parts.at(-1) === "string")
        parts[parts.length - 1] = String(parts.at(-1)) + write;
      else parts.push(write);
    }
  }
  flush();
  if (steps.length === 1) return steps[0]!;
  return (frame) => {
    for (const step of steps) step(frame);
  };
}

export function prepareProgram(document: IrDocument): RenderProgram | null {
  if (programs.has(document)) return programs.get(document)!;
  if (!supported(document.instructions)) {
    programs.set(document, null);
    return null;
  }
  const preparation: Preparation = { slots: 0, used: new Set(), wholeContext: false };
  const execute = block(document.instructions, new Map(), preparation);
  // Whole-scope values can be mutated by filters; retain their interpreter semantics.
  if (preparation.wholeContext) {
    programs.set(document, null);
    return null;
  }
  const program: RenderProgram = {
    render(context, options) {
      const frame: Frame = { context, values: [], options, output: "" };
      const errors: Error[] = [];
      try {
        frame.context = { ...context };
        execute(frame);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      return { html: frame.output, errors };
    },
  };
  programs.set(document, program);
  return program;
}
