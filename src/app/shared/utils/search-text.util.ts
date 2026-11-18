/**
 * Normalises text for forgiving Arabic/English search: case-insensitive,
 * ignores diacritics (tashkeel/tatweel) and unifies common letter variants
 * (أ/إ/آ -> ا, ى -> ي, ة -> ه) so partial names match however they were typed.
 */
export function normalizeSearchText(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}
