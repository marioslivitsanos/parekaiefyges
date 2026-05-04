/**
 * fetch-places.mjs  —  Neue Google Places API (v1)
 * Ausführen: node fetch-places.mjs
 * API-Key in der .env Datei: GOOGLE_PLACES_API_KEY=dein_schlüssel
 */

import { writeFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!KEY) {
  console.error('\n❌  Fehler: GOOGLE_PLACES_API_KEY fehlt in der .env Datei.');
  process.exit(1);
}

const BASE = 'https://places.googleapis.com/v1';
const LAT  = 38.7976814;
const LNG  = 20.7168335;

function headers(fieldMask) {
  return {
    'Content-Type':    'application/json',
    'X-Goog-Api-Key':  KEY,
    ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
  };
}

// ── Schritt 1: Place ID finden ─────────────────────────────────────────
async function findPlace() {
  const res = await fetch(`${BASE}/places:searchText`, {
    method: 'POST',
    headers: headers('places.id,places.displayName'),
    body: JSON.stringify({
      textQuery: 'Πάρε & έφυγες Καριώτες Λευκάδα',
      locationBias: {
        circle: {
          center: { latitude: LAT, longitude: LNG },
          radius: 3000.0,
        },
      },
      maxResultCount: 1,
    }),
  });

  const data = await res.json();
  if (!data.places?.length) {
    console.error('❌  Ort nicht gefunden:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const place = data.places[0];
  console.log(`✓  Gefunden: "${place.displayName?.text}"  (ID: ${place.id})`);
  return place.id;
}

// ── Schritt 2: Details in einer Sprache abrufen ────────────────────────
async function fetchDetails(placeId, langCode) {
  const fieldMask = [
    'rating',
    'userRatingCount',
    'reviews',
    'regularOpeningHours',
    'formattedAddress',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'location',
    'websiteUri',
    'displayName',
    'photos',
  ].join(',');

  const res  = await fetch(`${BASE}/places/${placeId}?languageCode=${langCode}`, {
    headers: headers(fieldMask),
  });
  const data = await res.json();

  if (data.error) {
    console.error(`❌  Details (${langCode}) Fehler:`, data.error.message);
    process.exit(1);
  }
  return data;
}

// ── Schritt 3: Foto-CDN-URLs abrufen (kein API-Key im Browser nötig) ───
async function fetchPhotoUris(photos) {
  const results = [];
  const limit = Math.min(photos.length, 8);
  console.log(`⏳ Lade ${limit} Fotos …`);

  for (let i = 0; i < limit; i++) {
    const photo = photos[i];
    const url = `${BASE}/${photo.name}/media?maxHeightPx=900&maxWidthPx=1200&skipHttpRedirect=true`;
    try {
      const r = await fetch(url, { headers: { 'X-Goog-Api-Key': KEY } });
      const d = await r.json();
      if (d.photoUri) {
        results.push({
          uri:         d.photoUri,
          attribution: photo.authorAttributions?.[0]?.displayName ?? '',
        });
        console.log(`   ✓  Foto ${i + 1} geladen`);
      }
    } catch {
      console.warn(`   ⚠️  Foto ${i + 1} fehlgeschlagen`);
    }
  }
  return results;
}

// ── Hauptlogik ─────────────────────────────────────────────────────────
const placeId = await findPlace();

console.log('⏳ Lade Daten auf Griechisch und Englisch …');
const [el, en] = await Promise.all([
  fetchDetails(placeId, 'el'),
  fetchDetails(placeId, 'en'),
]);

// Fotos laden
const photos = el.photos?.length
  ? await fetchPhotoUris(el.photos)
  : [];

// Reviews transformieren
const reviews = (el.reviews ?? []).map(r => ({
  author_name:       r.authorAttribution?.displayName ?? 'Ανώνυμος',
  profile_photo_url: r.authorAttribution?.photoUri ?? '',
  rating:            r.rating ?? 5,
  time:              r.publishTime
    ? Math.floor(new Date(r.publishTime).getTime() / 1000)
    : 0,
  text: r.text?.text ?? '',
}));

const output = {
  place_id:             placeId,
  name:                 el.displayName?.text ?? 'Πάρε & Έφυγες',
  rating:               el.rating          ?? null,
  user_ratings_total:   el.userRatingCount ?? null,
  formatted_phone_number:
    el.nationalPhoneNumber ?? el.internationalPhoneNumber ?? null,
  website: el.websiteUri ?? null,
  geometry: {
    location: {
      lat: el.location?.latitude  ?? LAT,
      lng: el.location?.longitude ?? LNG,
    },
  },
  formatted_address: {
    el: el.formattedAddress ?? '',
    en: en.formattedAddress ?? '',
  },
  opening_hours: {
    open_now:     el.regularOpeningHours?.openNow ?? null,
    weekday_text: {
      el: el.regularOpeningHours?.weekdayDescriptions ?? [],
      en: en.regularOpeningHours?.weekdayDescriptions ?? [],
    },
    periods: el.regularOpeningHours?.periods ?? [],
  },
  photos,
  reviews,
  fetched_at: new Date().toISOString(),
};

writeFileSync('places-data.json', JSON.stringify(output, null, 2), 'utf8');

const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

console.log('\n✅  places-data.json gespeichert!');
console.log(`   ⭐ Bewertung:    ${output.rating ?? '–'} (${output.user_ratings_total ?? '–'} Rezensionen)`);
console.log(`   📝 Reviews:      ${output.reviews.length} geladen`);
console.log(`   📸 Fotos:        ${output.photos.length} geladen`);
console.log(`   📍 Adresse (el): ${output.formatted_address.el}`);
if (output.formatted_phone_number)
  console.log(`   📞 Telefon:      ${output.formatted_phone_number}`);
const todayLine = output.opening_hours.weekday_text.el[todayIdx];
if (todayLine) console.log(`   🕐 Heute:        ${todayLine}`);
console.log(`   📅 Abgerufen:    ${output.fetched_at}\n`);
