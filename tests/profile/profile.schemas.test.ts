import { describe, expect, it } from 'vitest';

import { updateProfileSchema } from '../../src/modules/profile/profile.schemas.js';

describe('updateProfileSchema', () => {
  it('accepts a partial update and trims text', () => {
    expect(
      updateProfileSchema.parse({
        displayName: '  Veronica  ',
        language: 'en',
      }),
    ).toEqual({ displayName: 'Veronica', language: 'en' });
  });

  it('accepts clearing text fields and coordinates together', () => {
    expect(
      updateProfileSchema.parse({
        displayName: null,
        locationName: null,
        latitude: null,
        longitude: null,
      }),
    ).toEqual({
      displayName: null,
      locationName: null,
      latitude: null,
      longitude: null,
    });
  });

  it('accepts a complete preferences update', () => {
    const input = {
      locationName: 'Observatório',
      latitude: -22.9,
      longitude: -47.06,
      notificationsEnabled: false,
      measurementUnit: 'imperial',
      language: 'pt-BR',
    };

    expect(updateProfileSchema.parse(input)).toEqual(input);
  });

  it.each([
    ['empty body', {}],
    ['unknown field', { displayName: 'Ana', role: 'admin' }],
    ['avatar URL', { avatarUrl: 'https://example.com/a.png' }],
    ['blank display name', { displayName: '   ' }],
    ['long display name', { displayName: 'x'.repeat(101) }],
    ['long location name', { locationName: 'x'.repeat(121) }],
    ['latitude without longitude', { latitude: 10 }],
    ['longitude without latitude', { longitude: 10 }],
    ['mixed null coordinates', { latitude: 10, longitude: null }],
    ['latitude out of range', { latitude: 91, longitude: 0 }],
    ['longitude out of range', { latitude: 0, longitude: -181 }],
    ['coordinate as string', { latitude: '10', longitude: '20' }],
    ['unknown unit', { measurementUnit: 'kelvin' }],
    ['unknown language', { language: 'es' }],
    ['non-boolean notifications', { notificationsEnabled: 'yes' }],
  ])('rejects %s', (_name, input) => {
    expect(updateProfileSchema.safeParse(input).success).toBe(false);
  });
});
