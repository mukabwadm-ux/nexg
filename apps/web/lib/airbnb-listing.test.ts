import { describe, expect, it } from 'vitest';

import {
  airbnbListingId,
  isAirbnbHost,
  isAirbnbImageHost,
  parseAirbnbListing,
  parseAirbnbUrl,
  parsePreviewTitle,
  propertyKindFor,
} from './airbnb-listing';

/* Tags copied from three real Nairobi listings (November 2026). */
const PAGE = `<html><head>
<meta property="og:url" content="https://www.airbnb.com/rooms/1018163117538277685"/>
<meta property="og:title" content="Rental unit in Nairobi · ★4.81 · 2 bedrooms · 2 beds · 2 baths"/>
<meta property="og:description" content="Stylish 2 Bedroom apartment in Kilimani near Yaya"/>
<meta property="og:image" content="https://a0.muscache.com/im/pictures/miso/Hosting-1018163117538277685/original/6d0326f2.jpeg?im_w=720&amp;width=720&amp;quality=70&amp;auto=webp"/>
</head><body><script>{"personCapacity":4}</script></body></html>`;

describe('parsePreviewTitle', () => {
  it('reads type, city, rating and room counts', () => {
    expect(
      parsePreviewTitle('Rental unit in Nairobi · ★4.81 · 2 bedrooms · 2 beds · 2 baths'),
    ).toEqual({
      typeLabel: 'Rental unit',
      city: 'Nairobi',
      rating: 4.81,
      bedrooms: 2,
      beds: 2,
      bathrooms: 2,
    });
  });

  it('treats a studio as zero bedrooms and reads singular nouns', () => {
    const studio = parsePreviewTitle('Rental unit in Nairobi · ★4.9 · Studio · 1 bed · 1 bath');
    expect(studio.bedrooms).toBe(0);
    expect(studio.beds).toBe(1);
    expect(studio.bathrooms).toBe(1);
  });

  it('reads shared and half baths, and copes with no rating', () => {
    const title = parsePreviewTitle(
      'Guest suite in Kilifi · 1 bedroom · 2 beds · 1.5 shared baths',
    );
    expect(title).toMatchObject({
      typeLabel: 'Guest suite',
      city: 'Kilifi',
      rating: null,
      bedrooms: 1,
      bathrooms: 1.5,
    });
  });
});

describe('parseAirbnbListing', () => {
  it('builds the listing from the preview tags', () => {
    const listing = parseAirbnbListing(PAGE, '1018163117538277685');
    expect(listing).toMatchObject({
      id: '1018163117538277685',
      url: 'https://www.airbnb.com/rooms/1018163117538277685',
      name: 'Stylish 2 Bedroom apartment in Kilimani near Yaya',
      kind: 'apartment',
      city: 'Nairobi',
      bedrooms: 2,
      bathrooms: 2,
      maxGuests: 4,
    });
    expect(listing.photoUrl).toBe(
      'https://a0.muscache.com/im/pictures/miso/Hosting-1018163117538277685/original/6d0326f2.jpeg?im_w=1200',
    );
  });

  it('drops a cover photo that is not on Airbnb’s image host', () => {
    const page = PAGE.replace('https://a0.muscache.com', 'https://evil.example');
    expect(parseAirbnbListing(page, '1').photoUrl).toBeNull();
  });
});

describe('links and hosts', () => {
  it('accepts Airbnb links with or without https, and finds the id', () => {
    const url = parseAirbnbUrl('airbnb.co.ke/rooms/1629627401858356968?guests=1');
    expect(url && airbnbListingId(url)).toBe('1629627401858356968');
    expect(airbnbListingId(new URL('https://www.airbnb.com/rooms/plus/12345678'))).toBe('12345678');
  });

  it('refuses look-alike hosts', () => {
    expect(isAirbnbHost('airbnb.com.evil.io')).toBe(false);
    expect(isAirbnbHost('notairbnb.com')).toBe(false);
    expect(parseAirbnbUrl('https://airbnb-rooms.example/rooms/1')).toBeNull();
    expect(isAirbnbImageHost('muscache.com.evil.io')).toBe(false);
    expect(isAirbnbHost('www.airbnb.com')).toBe(true);
    expect(isAirbnbHost('abnb.me')).toBe(true);
  });
});

describe('propertyKindFor', () => {
  it('maps Airbnb types to NexG property kinds', () => {
    expect(propertyKindFor('Villa', 4)).toBe('villa');
    expect(propertyKindFor('Guesthouse', 1)).toBe('guest_house');
    expect(propertyKindFor('Rental unit', 0)).toBe('studio');
    expect(propertyKindFor('Condo', 2)).toBe('apartment');
  });
});
