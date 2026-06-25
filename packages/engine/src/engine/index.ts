import { compile, type CompileOptions, type CompileResult } from "@stncil/core";
import { RuntimeEngine, type RenderContext, type RenderResult } from "@stncil/runtime";
import { CompilerCache } from "../cache/index";
import { TemplateLoader, type FileSystem } from "../loader/index";
import type { IrDocument } from "@stncil/core";

export interface EngineOptions {
  readonly cache?: boolean;
  readonly cacheSize?: number;
  readonly strict?: boolean;
  readonly debug?: boolean;
  readonly fs?: FileSystem;
}

export interface CompileAndRenderOptions {
  readonly sourceFile?: string;
  readonly context?: RenderContext;
}

export class Engine {
  private loader: TemplateLoader;
  private cache: CompilerCache;
  private compileOptions: Omit<CompileOptions, "source" | "sourceFile">;
  private useCache: boolean;

  constructor(options: EngineOptions = {}) {
    this.useCache = options.cache !== false;
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
    const engine = new RuntimeEngine(ir);
    return engine.render(options.context ?? context);
  }

  async render(
    path: string,
    context: RenderContext = {},
  ): Promise<RenderResult> {
    const source = await this.loader.load(path);
    const ir = await this.compileToIr(source.content, source.path);
    const engine = new RuntimeEngine(ir);
    return engine.render(context);
  }

  async renderStream(
    path: string,
    context: RenderContext = {},
  ): Promise<ReadableStream<string>> {
    const source = await this.loader.load(path);
    const ir = await this.compileToIr(source.content, source.path);
    const engine = new RuntimeEngine(ir);
    return engine.renderStream(context);
  }

  registerTemplate(path: string, content: string): void {
    this.loader.addSource(path, content);
  }

  private async compileToIr(source: string, sourceFile: string): Promise<IrDocument> {
    const hash = this.simpleHash(source);

    if (this.useCache) {
      const cached = this.cache.get(hash);
      if (cached) return cached;
    }

    const result = await this.compile(source, sourceFile);

    if (this.useCache) {
      this.cache.set(hash, result.ir);
    }

    return result.ir;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}
