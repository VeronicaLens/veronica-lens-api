import type { CelestialObject } from './catalog.types.js';

type ObjectData = Readonly<
  Omit<CelestialObject, 'aliases'> & { aliases: readonly string[] }
>;

function ephemeris(
  id: string,
  name: string,
  type: 'moon' | 'planet',
  providerObjectId: string,
  aliases: string[],
): ObjectData {
  return {
    id,
    name,
    type,
    aliases,
    magnitude: null,
    coordinates: { kind: 'ephemeris', provider: 'jpl-horizons', providerObjectId },
  };
}

function fixed(
  id: string,
  name: string,
  type: 'star' | 'constellation',
  rightAscensionDegrees: number,
  declinationDegrees: number,
  magnitude: number | null,
  aliases: string[],
): ObjectData {
  return {
    id,
    name,
    type,
    aliases,
    magnitude,
    coordinates: {
      kind: 'fixed',
      epoch: 'J2000',
      rightAscensionDegrees,
      declinationDegrees,
    },
  };
}

// Constellation coordinates are approximate centers for orientation only.
export const CATALOG: readonly ObjectData[] = [
  ephemeris('moon', 'Lua', 'moon', '301', ['Moon', 'Luna']),
  ephemeris('mercury', 'Mercúrio', 'planet', '199', ['Mercury']),
  ephemeris('venus', 'Vênus', 'planet', '299', ['Venus']),
  ephemeris('mars', 'Marte', 'planet', '499', ['Mars']),
  ephemeris('jupiter', 'Júpiter', 'planet', '599', ['Jupiter']),
  ephemeris('saturn', 'Saturno', 'planet', '699', ['Saturn']),
  ephemeris('uranus', 'Urano', 'planet', '799', ['Uranus']),
  ephemeris('neptune', 'Netuno', 'planet', '899', ['Neptune']),
  fixed('sirius', 'Sirius', 'star', 101.287155, -16.716116, -1.46, ['Sírius']),
  fixed('canopus', 'Canopus', 'star', 95.987878, -52.695661, -0.74, ['Canopo']),
  fixed('alpha-centauri', 'Alpha Centauri', 'star', 219.902083, -60.833972, -0.1, [
    'Alfa Centauri',
    'Rigil Kentaurus',
  ]),
  fixed('arcturus', 'Arcturus', 'star', 213.9153, 19.182409, -0.05, ['Arcturo']),
  fixed('vega', 'Vega', 'star', 279.234735, 38.783689, 0.03, []),
  fixed('capella', 'Capella', 'star', 79.172328, 45.997991, 0.08, ['Capela']),
  fixed('rigel', 'Rigel', 'star', 78.634467, -8.201639, 0.13, []),
  fixed('betelgeuse', 'Betelgeuse', 'star', 88.792939, 7.407064, 0.42, ['Betelgueuse']),
  fixed('achernar', 'Achernar', 'star', 24.428523, -57.236753, 0.46, []),
  fixed('hadar', 'Hadar', 'star', 210.955856, -60.373039, 0.61, ['Beta Centauri']),
  fixed('acrux', 'Acrux', 'star', 186.649563, -63.099092, 0.76, ['Alpha Crucis']),
  fixed('antares', 'Antares', 'star', 247.351915, -26.432002, 0.91, ['Antares A']),
  fixed('orion', 'Órion', 'constellation', 83.822083, -5.391111, null, ['Orion']),
  fixed('crux', 'Cruzeiro do Sul', 'constellation', 186.25, -60, null, [
    'Crux',
    'Cruz do Sul',
  ]),
  fixed('scorpius', 'Escorpião', 'constellation', 252.5, -26, null, ['Scorpius']),
  fixed('ursa-major', 'Ursa Maior', 'constellation', 165.932, 61.751, null, [
    'Ursa Major',
    'Grande Ursa',
  ]),
];
