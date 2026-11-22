import { compile, type CompileOptions, type CompileResult } from "@stncil/core";
import {
  RuntimeEngine,
  type RenderContext,
  type RenderResult,
  type RuntimeOptions,
} from "@stncil/runtime";
import { CompilerCache } from "../cache/index";
import { TemplateLoader, type FileSystem } from "../loader/index";
import type { IrDocument } from "@stncil/core";

export interface EngineOptions extends RuntimeOptions {
  readonly cache?: boolean;
  readonly cacheSize?: number;
  readonly strict?: boolean;
  readonly debug?: boolean;
  readonly fs?: FileSystem;
}

export interface CompileAndRenderOptions extends RuntimeOptions {
  readonly sourceFile?: string;
  readonly context?: RenderContext;
}

export class Engine {
  private loader: TemplateLoader;
  private cache: CompilerCache;
  private compileOptions: Omit<CompileOptions, "source" | "sourceFile">;
  private useCache: boolean;

  constructor(private readonly options: EngineOptions = {}) {
    this.useCache = options.cache !== false && options.cacheSize !== 0;
    this.cache = new CompilerCache(options.cacheSize ?? 256);
    this.loader = new TemplateLoader(options.fs);
    this.compileOptions = {
      strict: options.strict ?? false,
      debug: options.debug ?? true,
    };
  }

  async compile(source: string, sourceFile: string = "<input>"): Promise<CompileResult> {
    return compile({
      source,
      sourceFile,
      ...this.compileOptions,
    });
  }

  async compileAndRender(
    source: string,
    context: RenderContext = {},
    options: CompileAndRenderOptions = {},
  ): Promise<RenderResult> {
    const sourceFile = options.sourceFile ?? "<input>";
    const ir = await this.compileToIr(source, sourceFile);
    const engine = this.runtime(ir, options);
    return engine.renderAsync(options.context ?? context);
  }

  async render(
    path: string,
    context: RenderContext = {},
    options: RuntimeOptions = {},
  ): Promise<RenderResult> {
    const source = await this.loader.load(path);
    const ir = await this.compileToIr(source.content, source.path);
    const engine = this.runtime(ir, options);
    return engine.renderAsync(context);
  }

  async renderStream(
    path: string,
    context: RenderContext = {},
    options: RuntimeOptions = {},
  ): Promise<ReadableStream<string>> {
    const source = await this.loader.load(path);
    const ir = await this.compileToIr(source.content, source.path);
    const engine = this.runtime(ir, options);
    return engine.renderStream(context);
  }

  registerTemplate(path: string, content: string): void {
    this.loader.addSource(path, content);
  }

  private runtime(ir: IrDocument, options: RuntimeOptions): RuntimeEngine {
    return new RuntimeEngine(ir, {
      ...this.options,
      resolveTemplate:
        this.options.resolveTemplate ?? ((path, fromFile) => this.loadIr(path, fromFile)),
      ...options,
    });
  }

  private async loadIr(path: string, fromFile: string): Promise<IrDocument> {
    const parts: string[] = [];
    const absolute = path.startsWith("/") || fromFile.startsWith("/");
    const base = path.startsWith("/") ? [] : fromFile.split("/").slice(0, -1);
    for (const part of [...base, ...path.split("/")]) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    let resolved = `${absolute ? "/" : ""}${parts.join("/")}`;
    if (!this.loader.hasSource(resolved) && this.loader.hasSource(`${resolved}.stn`))
      resolved += ".stn";
    const source = await this.loader.load(resolved);
    return this.compileToIr(source.content, source.path);
  }

  private async compileToIr(source: string, sourceFile: string): Promise<IrDocument> {
    if (!this.useCache) {
      return (await this.compile(source, sourceFile)).ir;
    }

    const key = JSON.stringify([sourceFile, source]);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const result = await this.compile(source, sourceFile);
    this.cache.set(key, result.ir);
    return result.ir;
  }
}
