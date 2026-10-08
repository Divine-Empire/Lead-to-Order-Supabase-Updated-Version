// Turns a user-typed search phrase into tokens that still find a match even
// when the real data has stray punctuation nobody would type while
// searching -- e.g. "S.S. CONSTRUCTIONS" should be found by typing
// "SS construction". Each token keeps only its letters/digits; matching
// then allows any run of punctuation/whitespace between those characters in
// the data, but never skips a different letter/digit -- so it stays a
// precise, order-preserving match, just symbol-blind on both sides.

export const tokenizeLoose = (term) =>
  (term || "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

// Postgres POSIX regex fragment (for the `imatch` / ~* operator) matching
// a cleaned token's characters in order, with optional non-alphanumeric
// filler between them.
export const buildPgLooseToken = (cleanedToken) =>
  cleanedToken.split("").join("[^a-zA-Z0-9]*");

// Client-side equivalent: strips symbols out of the candidate string, then
// does a plain substring check against the (already-cleaned) token.
export const looseIncludes = (value, cleanedToken) => {
  if (!value) return false;
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").includes(cleanedToken);
};
