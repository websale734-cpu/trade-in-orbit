/** Fill `{name}` placeholders in a dictionary string: fmt("Hi {name}", { name: "Ada" }). */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}
