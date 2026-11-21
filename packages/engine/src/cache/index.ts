import type { IrDocument } from "@stncil/core";

export class CompilerCache {
  private entries: Map<string, IrDocument> = new Map();
  private readonly maxSize: number;

  constructor(maxSize: number = 256) {
    if (!Number.isSafeInteger(maxSize) || maxSize < 0) {
      throw new RangeError("Cache size must be a non-negative safe integer");
    }
    this.maxSize = maxSize;
  }

  get(key: string): IrDocument | undefined {
    const ir = this.entries.get(key);
    if (!ir) return undefined;
    this.entries.delete(key);
    this.entries.set(key, ir);
    return ir;
  }

  set(key: string, ir: IrDocument): void {
    if (this.maxSize === 0) return;
    this.entries.delete(key);
    if (this.entries.size >= this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, ir);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
