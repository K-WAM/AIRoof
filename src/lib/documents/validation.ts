export function validNarrative(value: unknown): value is string {
  return typeof value === "string" && value.length <= 4000 && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

export function validTechnicians(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 10 && value.every((name) => typeof name === "string" && name.length <= 100 && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(name));
}
