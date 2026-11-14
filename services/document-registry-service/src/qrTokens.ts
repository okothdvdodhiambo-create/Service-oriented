export function isCurrentQrToken(storedToken: string | null, presentedToken: string): boolean {
  return storedToken !== null && storedToken === presentedToken;
}
