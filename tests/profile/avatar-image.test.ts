import { describe, expect, it } from 'vitest';

import {
  detectImageType,
  isAvatarContentType,
} from '../../src/modules/profile/avatar-image.js';
import { jpegBytes, pngBytes, webpBytes } from '../helpers/images.js';

describe('detectImageType', () => {
  it.each([
    ['image/jpeg', jpegBytes],
    ['image/png', pngBytes],
    ['image/webp', webpBytes],
  ])('detects %s by its signature', (type, bytes) => {
    expect(detectImageType(bytes)).toBe(type);
  });

  it.each([
    ['empty file', Buffer.alloc(0)],
    ['text', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['GIF', Buffer.from('GIF89a')],
    ['RIFF without WEBP', Buffer.from('RIFF\x00\x00\x00\x00WAVE')],
    ['truncated PNG', pngBytes.subarray(0, 4)],
  ])('rejects %s', (_name, bytes) => {
    expect(detectImageType(bytes)).toBeNull();
  });
});

describe('isAvatarContentType', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(isAvatarContentType(type)).toBe(true);
  });

  it.each([undefined, '', 'image/gif', 'image/svg+xml', 'application/json'])(
    'rejects %j',
    (type) => {
      expect(isAvatarContentType(type)).toBe(false);
    },
  );
});
