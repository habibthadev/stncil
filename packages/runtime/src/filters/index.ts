import { escapeHtml } from "../escape/html";
import { escapeUrl } from "../escape/url";

export type FilterFn = (value: unknown, ...args: unknown[]) => unknown;

const filters: Record<string, FilterFn> = Object.assign(Object.create(null), {
  upper: (value) => String(value ?? "").toUpperCase(),
  lower: (value) => String(value ?? "").toLowerCase(),
  capitalize: (value) => {
    const s = String(value ?? "");
    if (s.length === 0) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  title: (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/\b\w/g, (ch) => ch.toUpperCase()),
  trim: (value) => String(value ?? "").trim(),
  ltrim: (value) => String(value ?? "").trimStart(),
  rtrim: (value) => String(value ?? "").trimEnd(),

  truncate: (value, maxLen = 30, suffix = "...") => {
    const s = String(value ?? "");
    const max = Number(maxLen) || 30;
    if (s.length <= max) return s;
    return s.slice(0, max) + String(suffix);
  },

  length: (value) => {
    if (value == null) return 0;
    if (typeof value === "string" || Array.isArray(value)) return value.length;
    if (typeof value === "object") return Object.keys(value).length;
    return 0;
  },

  first: (value) => {
    if (Array.isArray(value)) return value[0] ?? null;
    if (typeof value === "string") return value.charAt(0) || null;
    return null;
  },
  last: (value) => {
    if (Array.isArray(value)) return value[value.length - 1] ?? null;
    if (typeof value === "string") return value.charAt(value.length - 1) || null;
    return null;
  },
  reverse: (value) => {
    if (Array.isArray(value)) return [...value].reverse();
    if (typeof value === "string") return value.split("").reverse().join("");
    return value;
  },
  join: (value, separator = ",") => {
    if (!Array.isArray(value)) return String(value ?? "");
    return value.map((v) => (v == null ? "" : String(v))).join(String(separator));
  },
  sort: (value) => {
    if (!Array.isArray(value)) return value;
    return [...value].sort((a, b) => {
      const sa = String(a ?? "");
      const sb = String(b ?? "");
      return sa.localeCompare(sb);
    });
  },
  json: (value, indent?: unknown) => JSON.stringify(value, null, indent != null ? Number(indent) : undefined),
  raw: (value) => value,
  escape: (value) => escapeHtml(value),
  default: (value, def = "") => (value == null || value === "" ? def : value),

  number_format: (value, decimals = 0, decSep = ".", thouSep = ",") => {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? "");
    const parts = num.toFixed(Number(decimals)).split(".");
    parts[0] = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, String(thouSep));
    return parts.join(String(decSep));
  },

  date_format: (value, fmt?: unknown) => {
    if (value == null) return "";
    const formatStr = String(fmt ?? "YYYY-MM-DD");
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value ?? "");
    const pad = (n: number) => String(n).padStart(2, "0");
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const tokens: Record<string, string> = {
      YYYY: String(d.getFullYear()), YY: String(d.getFullYear()).slice(-2),
      MMMM: months[d.getMonth()]!, MMM: months[d.getMonth()]!.slice(0, 3),
      MM: pad(d.getMonth() + 1), M: String(d.getMonth() + 1),
      DD: pad(d.getDate()), D: String(d.getDate()),
      dddd: weekdays[d.getDay()]!, ddd: weekdays[d.getDay()]!.slice(0, 3),
      HH: pad(d.getHours()), H: String(d.getHours()),
      mm: pad(d.getMinutes()), m: String(d.getMinutes()),
      ss: pad(d.getSeconds()), s: String(d.getSeconds()),
    };
    const aliases: Record<string, string> = { "%Y": "YYYY", "%y": "YY", "%m": "MM", "%b": "MMM", "%B": "MMMM", "%d": "DD", "%H": "HH", "%M": "mm", "%S": "ss" };
    return formatStr.replace(/%[YymbBdHMS]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|mm|m|ss|s/g,
      token => tokens[aliases[token] ?? token]!);
  },

  url_encode: (value) => escapeUrl(value),

  split: (value, delimiter = ",") => String(value ?? "").split(String(delimiter)),
  replace: (value, search, replacement = "") => String(value ?? "").split(String(search)).join(String(replacement)),
} satisfies Record<string, FilterFn>);

export function getFilter(name: string): FilterFn | undefined {
  return Object.hasOwn(filters, name) ? filters[name] : undefined;
}

export function registerFilter(name: string, fn: FilterFn): void {
  filters[name] = fn;
}

export function hasFilter(name: string): boolean {
  return Object.hasOwn(filters, name);
}

export { filters };
