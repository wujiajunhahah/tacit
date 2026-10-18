// Small display helpers shared by the ledger UI and the MCP text output.

export const pct = (x: number): string => `${Math.round(x * 100)}%`;

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}
