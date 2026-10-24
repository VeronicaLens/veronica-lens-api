export const AVATAR_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

// Matches the `avatars` bucket file_size_limit (5 MiB).
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export interface AvatarFile {
  contentType: AvatarContentType;
  bytes: Buffer;
}

export function isAvatarContentType(
  value: string | undefined,
): value is AvatarContentType {
  return (AVATAR_CONTENT_TYPES as readonly string[]).includes(value ?? '');
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

// Identifies the image by its file signature instead of trusting the header.
export function detectImageType(bytes: Uint8Array): AvatarContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  return null;
}
