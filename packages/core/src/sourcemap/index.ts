import { SourceMap, SourceLocation } from "../codegen/ir";

export function createSourceMap(): SourceMap {
  return { nodes: {} };
}

export function addSourceMapping(map: SourceMap, nodeId: string, location: SourceLocation): void {
  map.nodes[nodeId] = location;
}

export function getSourceLocation(map: SourceMap, nodeId: string): SourceLocation | undefined {
  return map.nodes[nodeId];
}
