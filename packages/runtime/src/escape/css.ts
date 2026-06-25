export function escapeCss(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    if (ch === 0) {
      result += "\ufffd";
    } else if (
      (ch >= 0x0001 && ch <= 0x001f) ||
      ch === 0x007f ||
      (ch >= 0x0080 && ch <= 0x009f)
    ) {
      result += `\\${ch.toString(16)} `;
    } else if (
      (ch >= 0x0020 && ch <= 0x007e) &&
      ch !== 0x0022 &&
      ch !== 0x0027 &&
      ch !== 0x005c &&
      ch !== 0x0060
    ) {
      result += str[i];
    } else {
      result += `\\${ch.toString(16)} `;
    }
  }
  return result;
}
