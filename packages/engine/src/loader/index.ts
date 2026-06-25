export interface TemplateSource {
  readonly path: string;
  readonly content: string;
  readonly hash: string;
}

export interface FileSystem {
  readFile(path: string): Promise<string>;
}

export class TemplateLoader {
  private sources: Map<string, TemplateSource> = new Map();
  private fs: FileSystem | null;

  constructor(fs?: FileSystem) {
    this.fs = fs ?? null;
  }

  addSource(path: string, content: string): void {
    const hash = simpleHash(content);
    this.sources.set(path, { path, content, hash });
  }

  getSource(path: string): TemplateSource | undefined {
    return this.sources.get(path);
  }

  async load(path: string): Promise<TemplateSource> {
    const cached = this.sources.get(path);
    if (cached) return cached;

    if (!this.fs) {
      throw new Error(`No file system provided and template "${path}" not found in sources`);
    }

    const content = await this.fs.readFile(path);
    const hash = simpleHash(content);
    const source: TemplateSource = { path, content, hash };
    this.sources.set(path, source);
    return source;
  }

  hasSource(path: string): boolean {
    return this.sources.has(path);
  }

  listSources(): TemplateSource[] {
    return Array.from(this.sources.values());
  }

  clear(): void {
    this.sources.clear();
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
