import { IrType } from "./types";

export interface ScopeEntry {
  readonly name: string;
  readonly type: IrType;
  readonly source: "context" | "let" | "each" | "async" | "error";
}

export class Scope {
  private readonly frames: Map<string, ScopeEntry>[] = [new Map()];

  pushFrame(): void {
    this.frames.push(new Map());
  }

  popFrame(): void {
    if (this.frames.length > 1) {
      this.frames.pop();
    }
  }

  declare(name: string, type: IrType, source: ScopeEntry["source"]): void {
    const current = this.frames[this.frames.length - 1]!;
    current.set(name, { name, type, source });
  }

  lookup(name: string): ScopeEntry | null {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const entry = this.frames[i]!.get(name);
      if (entry) return entry;
    }
    return null;
  }

  has(name: string): boolean {
    return this.lookup(name) !== null;
  }

  hasLocal(name: string): boolean {
    return this.frames[this.frames.length - 1]!.has(name);
  }

  clone(): Scope {
    const s = new Scope();
    s.frames.length = 0;
    for (const frame of this.frames) {
      s.frames.push(new Map(frame));
    }
    return s;
  }
}
