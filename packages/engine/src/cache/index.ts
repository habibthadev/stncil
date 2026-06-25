import type { IrDocument } from "@stncil/core";

interface CacheEntry {
  ir: IrDocument;
  accessOrder: number;
}

export class CompilerCache {
  private entries: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private counter = 0;

  constructor(maxSize: number = 256) {
    this.maxSize = maxSize;
  }

  get(sourceHash: string): IrDocument | undefined {
    const entry = this.entries.get(sourceHash);
    if (!entry) return undefined;
    entry.accessOrder = ++this.counter;
    return entry.ir;
  }

  set(sourceHash: string, ir: IrDocument): void {
    if (this.entries.size >= this.maxSize && !this.entries.has(sourceHash)) {
      this.evict();
    }
    this.entries.set(sourceHash, { ir, accessOrder: ++this.counter });
  }

  has(sourceHash: string): boolean {
    return this.entries.has(sourceHash);
  }

  delete(sourceHash: string): boolean {
    return this.entries.delete(sourceHash);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private evict(): void {
    let oldestKey: string | null = null;
    let oldestOrder = Infinity;
    for (const [key, entry] of this.entries) {
      if (entry.accessOrder < oldestOrder) {
        oldestOrder = entry.accessOrder;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  }
}
