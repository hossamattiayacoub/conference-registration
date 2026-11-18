/**
 * Supported image formats across the whole app: JPG/JPEG, PNG, WEBP.
 * Kept here as the single source of truth for both the reactive-form
 * validator (image-file.validator.ts) and the component's upload-trigger
 * gate, so "what counts as a supported image" is defined exactly once.
 */
export const SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export const UNSUPPORTED_IMAGE_FORMAT_MESSAGE =
  'صيغة الصورة غير مدعومة. يُرجى اختيار صورة بصيغة JPG أو PNG أو WEBP.';

/**
 * Checks whether a File is one of our supported image formats.
 *
 * Mobile browsers/pickers don't always report a reliable `file.type` - some
 * report an empty string for certain files. To handle that gracefully
 * without accepting clearly-unsupported formats:
 *
 * - If a MIME type IS reported, it must be one of the supported ones.
 *   A present-but-unsupported type (e.g. "image/heic", "image/heif" - the
 *   default format for iPhone camera photos) is rejected outright, even if
 *   the filename extension looks plausible. We never pretend to support a
 *   format we can't actually decode/preview in the browser.
 * - Only when the MIME type is empty/missing do we fall back to checking
 *   the filename extension against the supported list.
 */
export function isSupportedImageFile(file: File): boolean {
  const type = (file.type || '').toLowerCase().trim();
  if (type) {
    return SUPPORTED_IMAGE_MIME_TYPES.includes(type);
  }
  const name = (file.name || '').toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}
