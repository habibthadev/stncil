export type IrType =
  | { readonly kind: "string" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "date" }
  | { readonly kind: "null" }
  | { readonly kind: "object"; readonly fields: Record<string, IrType> }
  | { readonly kind: "record"; readonly value: IrType }
  | { readonly kind: "array"; readonly item: IrType }
  | { readonly kind: "union"; readonly variants: readonly IrType[] }
  | { readonly kind: "nullable"; readonly inner: IrType }
  | { readonly kind: "optional"; readonly inner: IrType }
  | { readonly kind: "trusted_html" }
  | { readonly kind: "trusted_js" }
  | { readonly kind: "trusted_css" }
  | { readonly kind: "trusted_url" };
