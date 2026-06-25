import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/index";

describe("debug", () => {
  it("trace specific source", () => {
    const src = "@if (x > 0 && y != null || true) { @let name = \"test\" }";
    const lexer = new Lexer(src);
    let lastPos = -1;
    const tokens = lexer.tokenize();
    console.log("Success!", tokens.length);
  });
});
