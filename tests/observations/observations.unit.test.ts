import { describe, expect, it } from 'vitest';

import { summarizeCaptureMetadata } from '../../src/modules/observations/observations.capture.js';
import {
  isObservationPhotoContentType,
  matchesObservationPhotoType,
} from '../../src/modules/observations/observation-photo.js';
import { observationPhotoMetadataSchema } from '../../src/modules/observations/observations.schemas.js';

function heifBytes(brand: string): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set([0x00, 0x00, 0x00, 0x18], 0);
  bytes.set(Buffer.from('ftyp'), 4);
  bytes.set(Buffer.from(brand), 8);
  return bytes;
}

describe('summarizeCaptureMetadata', () => {
  it('extracts the capture settings that the history shows', () => {
    expect(
      summarizeCaptureMetadata({
        device: { id: 'd', name: 'Pixel 8' },
        parameters: {
          iso: 800,
          exposureTimeSeconds: 2,
          exposureCompensationEv: -0.3,
          focusMode: 'manual',
          focusLensPosition: 0.25,
          whiteBalanceKelvin: 4200,
        },
      }),
    ).toEqual({
      deviceName: 'Pixel 8',
      iso: 800,
      exposureTimeSeconds: 2,
      exposureCompensationEv: -0.3,
      focusMode: 'manual',
      focusLensPosition: 0.25,
      whiteBalanceKelvin: 4200,
    });
  });

  it('turns automatic or malformed values into null', () => {
    expect(
      summarizeCaptureMetadata({
        device: { name: '' },
        parameters: { iso: 'automatic', exposureTimeSeconds: Number.NaN },
      }),
    ).toBeNull();
  });

  it('returns null for non-object metadata', () => {
    expect(summarizeCaptureMetadata(null)).toBeNull();
    expect(summarizeCaptureMetadata(['x'])).toBeNull();
    expect(summarizeCaptureMetadata('text')).toBeNull();
  });
});

describe('matchesObservationPhotoType', () => {
  it('accepts a JPEG signature', () => {
    expect(
      matchesObservationPhotoType(
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        'image/jpeg',
      ),
    ).toBe(true);
  });

  it('rejects a PNG declared as JPEG', () => {
    expect(
      matchesObservationPhotoType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/jpeg',
      ),
    ).toBe(false);
  });

  it('checks both RIFF and WEBP markers for WebP', () => {
    const webp = new Uint8Array(12);
    webp.set(Buffer.from('RIFF'), 0);
    webp.set(Buffer.from('WEBP'), 8);

    expect(matchesObservationPhotoType(webp, 'image/webp')).toBe(true);
    expect(matchesObservationPhotoType(webp.slice(0, 8), 'image/webp')).toBe(
      false,
    );
  });

  it.each(['heic', 'mif1', 'msf1'])(
    'accepts a HEIF file with brand %s',
    (brand) => {
      expect(matchesObservationPhotoType(heifBytes(brand), 'image/heic')).toBe(
        true,
      );
    },
  );

  it('rejects a HEIF-like file with an unknown brand', () => {
    expect(matchesObservationPhotoType(heifBytes('qt  '), 'image/heif')).toBe(
      false,
    );
  });

  it('rejects inputs shorter than the signature', () => {
    expect(
      matchesObservationPhotoType(new Uint8Array([0xff]), 'image/jpeg'),
    ).toBe(false);
    expect(matchesObservationPhotoType(new Uint8Array(4), 'image/heic')).toBe(
      false,
    );
  });
});

describe('isObservationPhotoContentType', () => {
  it('accepts only supported photo types', () => {
    expect(isObservationPhotoContentType('image/heic')).toBe(true);
    expect(isObservationPhotoContentType('image/gif')).toBe(false);
    expect(isObservationPhotoContentType(undefined)).toBe(false);
  });
});

describe('observationPhotoMetadataSchema', () => {
  const valid = {
    title: '  Nebulosa  ',
    capturedAt: '2026-05-01T20:00:00-03:00',
    device: { id: 'd', name: 'Pixel 8' },
    parameters: {
      focusMode: 'automatic',
      exposureMode: 'manual',
      exposureCompensationEv: 0,
      iso: 400,
      exposureTimeSeconds: 'automatic',
      fallbacks: ['manual-focus'],
    },
  };

  it('trims the title and defaults notes to an empty string', () => {
    const parsed = observationPhotoMetadataSchema.parse(valid);

    expect(parsed.title).toBe('Nebulosa');
    expect(parsed.notes).toBe('');
  });

  it('rejects latitude outside the valid range', () => {
    expect(() =>
      observationPhotoMetadataSchema.parse({ ...valid, latitude: 91 }),
    ).toThrow();
  });

  it('rejects more than five fallbacks', () => {
    expect(() =>
      observationPhotoMetadataSchema.parse({
        ...valid,
        parameters: {
          ...valid.parameters,
          fallbacks: [
            'focus-metering',
            'manual-exposure',
            'exposure-compensation',
            'manual-focus',
            'white-balance',
            'focus-metering',
          ],
        },
      }),
    ).toThrow();
  });
});
