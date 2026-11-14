function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j] ?? 0;
      previous[j] = Math.min(
        above + 1,
        (previous[j - 1] ?? 0) + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length] ?? 0;
}

export function namesMatch(claimantName: string, holderName: string): boolean {
  const claimant = normalize(claimantName);
  const holder = normalize(holderName);
  if (!claimant || !holder) return false;

  const claimantTokens = claimant.split(" ");
  const holderTokens = holder.split(" ");
  const exactSurnameMatch = claimantTokens.at(-1) === holderTokens.at(-1);
  const maxLength = Math.max(claimant.length, holder.length);
  return exactSurnameMatch && levenshteinDistance(claimant, holder) <= maxLength * 0.15;
}
