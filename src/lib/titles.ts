/** How much of a hypothesis survives in a browser tab before it is cut off. */
const MAX = 60;

/**
 * A hypothesis, as a tab name.
 *
 * Every page in the app was called "Hunch", so three open experiments were
 * three identical tabs and browser history was useless. The statement is the
 * only thing that tells them apart.
 */
export function pageTitle(statement: string): string {
  const clean = statement.trim().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!clean) return "Hunch";
  if (clean.length <= MAX) return clean;

  const cut = clean.slice(0, MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, "")}…`;
}
