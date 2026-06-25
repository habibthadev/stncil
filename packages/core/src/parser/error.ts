import { Span, StncilError } from "../error";

export class ParseError extends StncilError {
  constructor(
    message: string,
    public readonly span: Span,
    public readonly expected?: string[],
  ) {
    super(message);
    this.name = "StncilParseError";
  }
}
