import { describe, it, expect } from "vitest";
import { filters, getFilter, registerFilter, hasFilter } from "../src/filters/index";

describe("filters", () => {
  describe("string transforms", () => {
    it("upper", () => {
      expect(getFilter("upper")!("hello")).toBe("HELLO");
    });

    it("lower", () => {
      expect(getFilter("lower")!("HELLO")).toBe("hello");
    });

    it("capitalize", () => {
      expect(getFilter("capitalize")!("hello")).toBe("Hello");
    });

    it("title", () => {
      expect(getFilter("title")!("hello world")).toBe("Hello World");
    });

    it("trim", () => {
      expect(getFilter("trim")!("  hello  ")).toBe("hello");
    });
  });

  describe("truncate", () => {
    it("truncates long strings", () => {
      expect(getFilter("truncate")!("hello world", 5)).toBe("hello...");
    });

    it("does not truncate short strings", () => {
      expect(getFilter("truncate")!("hi", 5)).toBe("hi");
    });
  });

  describe("length", () => {
    it("returns string length", () => {
      expect(getFilter("length")!("hello")).toBe(5);
    });

    it("returns array length", () => {
      expect(getFilter("length")!([1, 2, 3])).toBe(3);
    });

    it("returns 0 for null", () => {
      expect(getFilter("length")!(null)).toBe(0);
    });
  });

  describe("array filters", () => {
    it("first", () => {
      expect(getFilter("first")!([1, 2, 3])).toBe(1);
    });

    it("last", () => {
      expect(getFilter("last")!([1, 2, 3])).toBe(3);
    });

    it("reverse array", () => {
      expect(getFilter("reverse")!([1, 2, 3])).toEqual([3, 2, 1]);
    });

    it("reverse string", () => {
      expect(getFilter("reverse")!("abc")).toBe("cba");
    });

    it("join", () => {
      expect(getFilter("join")!(["a", "b", "c"], "-")).toBe("a-b-c");
    });

    it("sort", () => {
      expect(getFilter("sort")!(["c", "a", "b"])).toEqual(["a", "b", "c"]);
    });
  });

  describe("utility filters", () => {
    it("default provides fallback", () => {
      expect(getFilter("default")!(null, "N/A")).toBe("N/A");
    });

    it("default does not override existing", () => {
      expect(getFilter("default")!("value", "N/A")).toBe("value");
    });

    it("json", () => {
      expect(getFilter("json")!({ a: 1 })).toBe('{"a":1}');
    });

    it("raw returns value unchanged", () => {
      expect(getFilter("raw")!("<b>bold</b>")).toBe("<b>bold</b>");
    });

    it("escape HTML-escapes", () => {
      expect(getFilter("escape")!("<script>")).toBe("&lt;script&gt;");
    });
  });

  describe("number_format", () => {
    it("formats with commas", () => {
      expect(getFilter("number_format")!(1234567, 0, ".", ",")).toBe("1,234,567");
    });

    it("formats with decimals", () => {
      expect(getFilter("number_format")!(1234.5, 2)).toBe("1,234.50");
    });
  });

  describe("date_format", () => {
    it("formats date", () => {
      const d = new Date(2024, 0, 15, 10, 30, 45);
      expect(getFilter("date_format")!(d, "YYYY-MM-DD HH:mm:ss")).toBe("2024-01-15 10:30:45");
    });

    it("matches month and weekday tokens without replacing their prefixes", () => {
      const d = new Date(2026, 5, 24, 14, 5, 9);
      expect(getFilter("date_format")!(d, "dddd, MMMM DD, YYYY HH:mm:ss")).toBe("Wednesday, June 24, 2026 14:05:09");
      expect(getFilter("date_format")!(d, "MMM DD / MMM DD")).toBe("Jun 24 / Jun 24");
      expect(getFilter("date_format")!(d, "%b %d, %Y")).toBe("Jun 24, 2026");
    });

    it("preserves invalid dates instead of displaying NaN", () => {
      expect(getFilter("date_format")!("not-a-date", "YYYY-MM-DD")).toBe("not-a-date");
      expect(getFilter("date_format")!(null)).toBe("");
    });
  });

  describe("split/replace", () => {
    it("split", () => {
      expect(getFilter("split")!("a,b,c", ",")).toEqual(["a", "b", "c"]);
    });

    it("replace", () => {
      expect(getFilter("replace")!("hello world", "world", "there")).toBe("hello there");
    });
  });

  describe("registration", () => {
    it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
      "does not expose inherited %s as a filter",
      (name) => {
        expect(hasFilter(name)).toBe(false);
        expect(getFilter(name)).toBeUndefined();
      },
    );

    it("registers __proto__ as an ordinary filter name", () => {
      const prototype = Object.getPrototypeOf(filters);
      const fn = (value: unknown) => String(value).toUpperCase();
      try {
        registerFilter("__proto__", fn);
        expect(Object.hasOwn(filters, "__proto__")).toBe(true);
        expect(Object.getPrototypeOf(filters)).toBe(prototype);
        expect(getFilter("__proto__")).toBe(fn);
        expect(hasFilter("__proto__")).toBe(true);
        expect(getFilter("__proto__")!("stncil")).toBe("STNCIL");
      } finally {
        delete filters["__proto__"];
        Object.setPrototypeOf(filters, prototype);
      }
    });

    it("registers custom filter", () => {
      registerFilter("double", (v) => Number(v) * 2);
      expect(getFilter("double")!(5)).toBe(10);
      expect(hasFilter("double")).toBe(true);
    });
  });
});
