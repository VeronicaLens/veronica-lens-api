export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  notificationsEnabled: boolean;
  measurementUnit: 'metric' | 'imperial';
  language: 'pt-BR' | 'en';
  createdAt: string;
  updatedAt: string;
}
