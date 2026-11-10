export const NO_VISIBLE_BRANCHES = "__NONE__";

export function explicitVisibleBranchIds(value?: string | null): string[] {
  if (!value || value === "*" || value === NO_VISIBLE_BRANCHES || value.startsWith("!")) return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
}

export function excludedBranchIds(value?: string | null): string[] {
  if (!value?.startsWith("!")) return [];
  return [...new Set(value.slice(1).split(",").map((id) => id.trim()).filter(Boolean))];
}

export function isProductVisibleInBranch(value: string | null | undefined, branchId: string): boolean {
  const visibility = value || "*";
  if (visibility === "*") return true;
  if (visibility === NO_VISIBLE_BRANCHES) return false;
  if (visibility.startsWith("!")) return !excludedBranchIds(visibility).includes(branchId);
  return explicitVisibleBranchIds(visibility).includes(branchId);
}

export function countVisibleBranches(value?: string | null): number | null {
  if (!value || value === "*") return null;
  if (value.startsWith("!")) return null;
  return explicitVisibleBranchIds(value).length;
}
