/**
 * Is "Continue with Google" available? Both halves of the OAuth client have to
 * be set; with either missing the provider is left out of the auth config and
 * the sign-in pages don't offer a button that would only fail.
 */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
