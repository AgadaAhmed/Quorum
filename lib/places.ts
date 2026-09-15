// Client-side Places helpers. Pure logic only in this file's top section;
// the network wrapper (searchPlaces / placePhotoUrl) follows below.

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface PlaceReview {
  author: string;
  rating: number | null;
  text: string;
  relativeTime: string;
}

export interface Place {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;      // mapped app category ('' if none)
  rating?: number;
  userRatingCount?: number; // how many Google ratings back the score
  reviews?: PlaceReview[];  // up to 3 recent reviews from Google
  photoRef?: string;     // Google photo resource name, resolved via the proxy
  featured?: boolean;    // Feature B hook — always false in Plan A
  source: 'google';
}

export const TIME_TITLE_PARTS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;
export type TitlePart = (typeof TIME_TITLE_PARTS)[number];

/** Bucket an hour-of-day into a greeting part. 5-12 Morning, 12-17 Afternoon,
 *  17-21 Evening, 21-5 Night. */
export function titlePartForDate(when: Date): TitlePart {
  const h = when.getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
}

export function titleForTime(venueName: string, when: Date): string {
  return `${titlePartForDate(when)} at ${venueName}`;
}

/** Map Google Places (New) type strings to Quorum's plan categories.
 *  Returns '' when nothing matches (plan category then left blank). */
export function mapGoogleTypesToCategory(types: string[] = []): string {
  const t = new Set(types || []);
  if (t.has('bar') || t.has('night_club')) return 'Party';
  if (t.has('restaurant') || t.has('cafe') || t.has('bakery') || t.has('meal_takeaway') || t.has('food')) return 'Food';
  if (t.has('gym') || t.has('stadium') || t.has('sports_complex')) return 'Sports';
  if (t.has('art_gallery') || t.has('museum')) return 'Art';
  if (t.has('movie_theater') || t.has('amusement_park') || t.has('bowling_alley')) return 'Party';
  if (t.has('library') || t.has('university') || t.has('book_store')) return 'Study';
  if (t.has('tourist_attraction') || t.has('park') || t.has('lodging')) return 'Travel';
  return '';
}

export interface LatLng { lat: number; lng: number; }

/** Search venues near a point via the Cloud Function proxy. Maps raw proxy rows
 *  into Place objects (adds the app `category`). Never throws to the UI — returns
 *  [] on failure so the screen can show an empty state. */
export async function searchPlaces(center: LatLng, category = ''): Promise<Place[]> {
  try {
    const call = httpsCallable(functions, 'placesSearch');
    const res: any = await call({ lat: center.lat, lng: center.lng, category });
    const rows: any[] = (res?.data?.places) || [];
    return rows.map((p) => ({
      placeId: p.placeId,
      name: p.name,
      address: p.address || '',
      lat: p.lat,
      lng: p.lng,
      category: p.category || mapGoogleTypesToCategory(p.types || []),
      rating: typeof p.rating === 'number' ? p.rating : undefined,
      userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
      reviews: Array.isArray(p.reviews) ? (p.reviews as PlaceReview[]) : undefined,
      photoRef: p.photoRef || undefined,
      featured: !!p.featured,
      source: 'google',
    }));
  } catch (e) {
    console.warn('searchPlaces failed', e);
    return [];
  }
}

/** Resolve a Google photo resource name to a displayable URL via the proxy. */
export async function placePhotoUrl(photoRef: string, maxWidthPx = 600): Promise<string | null> {
  try {
    const call = httpsCallable(functions, 'placePhoto');
    const res: any = await call({ photoRef, maxWidthPx });
    return res?.data?.url || null;
  } catch {
    return null;
  }
}
