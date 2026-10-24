export const OBSERVATION_PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type ObservationPhotoContentType =
  (typeof OBSERVATION_PHOTO_CONTENT_TYPES)[number];

// Matches the `observations` bucket file_size_limit (50 MiB).
export const MAX_OBSERVATION_PHOTO_BYTES = 50 * 1024 * 1024;

// HEIF files share one container; the brand at offset 8 names the coding.
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];

export function isObservationPhotoContentType(
  value: string | undefined,
): value is ObservationPhotoContentType {
  return (OBSERVATION_PHOTO_CONTENT_TYPES as readonly string[]).includes(
    value ?? '',
  );
}

// Checks the file signature so the declared content type cannot be spoofed.
export function matchesObservationPhotoType(
  bytes: Uint8Array,
  contentType: ObservationPhotoContentType,
): boolean {
  switch (contentType) {
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      );
    case 'image/heic':
    case 'image/heif':
      return (
        bytes.length >= 12 &&
        ascii(bytes, 4, 8) === 'ftyp' &&
        HEIF_BRANDS.includes(ascii(bytes, 8, 12))
      );
  }
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
