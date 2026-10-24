export interface AstronomicalEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: string;
  celestialObjectName: string | null;
  startsAt: string;
  endsAt: string | null;
  peaksAt: string | null;
}
