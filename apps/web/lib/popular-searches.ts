/**
 * The "Popular searches" buttons under the hero search.
 *
 * What a visitor types is matched to one of these topics, and the topic is
 * counted (rpc_popular_search_hit), never the words. The hero shows the four
 * most searched topics of the last 30 days. Until four topics have searches,
 * the rest of the row is filled in the order below, so a new site still shows
 * a full row: the first four are the row as it was first designed.
 *
 * Taps on the buttons themselves are not counted. Otherwise whatever is
 * showing would keep itself there.
 */

export interface PopularSearchTopic {
  id: string;
  label: string;
  /** A merchant category for Explore in the visitor's city, or a fixed page. */
  category?: string;
  href?: string;
  /** Matched against what was typed, lower-case. */
  words: string[];
}

export const POPULAR_SEARCH_TOPICS: PopularSearchTopic[] = [
  {
    id: 'airport',
    label: 'Airport pickup',
    href: '/ask?need=Airport%20Transfer',
    words: ['airport', 'pickup', 'pick up', 'transfer', 'taxi', 'flight', 'jkia'],
  },
  {
    id: 'stays',
    label: 'Hotel stays',
    href: '/stays',
    words: ['hotel', 'stay', 'airbnb', 'apartment', 'accommodation', 'lodging', 'room'],
  },
  {
    id: 'spa',
    label: 'Massage & spa',
    category: 'beauty_fashion',
    words: ['massage', 'spa', 'salon', 'beauty', 'hair', 'nails', 'barber', 'facial'],
  },
  {
    id: 'restaurants',
    label: 'Restaurants near me',
    category: 'restaurant',
    words: ['restaurant', 'food', 'eat', 'dinner', 'lunch', 'breakfast', 'meal', 'pizza', 'burger'],
  },
  {
    id: 'groceries',
    label: 'Groceries',
    category: 'supermarket',
    words: ['grocer', 'supermarket', 'essentials', 'milk', 'bread'],
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    category: 'pharmacy',
    words: ['pharmacy', 'chemist', 'medicine', 'drug', 'health'],
  },
  {
    id: 'drinks',
    label: 'Drinks delivery',
    category: 'bar_liquor',
    words: ['drink', 'liquor', 'wine', 'beer', 'alcohol', 'whisky', 'whiskey', 'vodka', 'bar'],
  },
  {
    id: 'flowers',
    label: 'Flowers & gifts',
    category: 'florist',
    words: ['flower', 'florist', 'bouquet', 'roses', 'gift', 'present'],
  },
  {
    id: 'laundry',
    label: 'Laundry',
    category: 'laundry',
    words: ['laundry', 'dry clean', 'washing', 'ironing'],
  },
  {
    id: 'trip',
    label: 'Plan your trip',
    href: '/experience',
    words: ['trip', 'tour', 'itinerary', 'experience', 'things to do', 'safari', 'day out'],
  },
];

export const POPULAR_SEARCH_IDS: readonly string[] = POPULAR_SEARCH_TOPICS.map((t) => t.id);

/** How many buttons the hero shows. */
export const POPULAR_SEARCH_COUNT = 4;

/**
 * The topic a search belongs to, or null. The first topic with a word that
 * appears in the search wins, so "hotel room service" is a stay.
 */
export function topicForSearch(query: string): string | null {
  const lower = query.toLowerCase().replace(/\s+/g, ' ').trim();
  if (lower.length < 3) return null;
  const words = lower.split(' ');
  for (const topic of POPULAR_SEARCH_TOPICS) {
    for (const word of topic.words) {
      /* Short words like "bar" or "eat" only as a whole word, so "barber"
         is not drinks and "great" is not food. */
      const hit =
        word.length <= 4 ? words.some((w) => w === word || w === `${word}s`) : lower.includes(word);
      if (hit) return topic.id;
    }
  }
  return null;
}

/**
 * The topics to show, most searched first. `searches` is per topic over the
 * last 30 days (rpc_popular_search_ranking). Ties, and a site with too few
 * searches yet, keep the order above.
 */
export function rankPopularSearches(searches: Record<string, number> = {}): string[] {
  return POPULAR_SEARCH_TOPICS.map((topic, index) => ({
    id: topic.id,
    index,
    count: searches[topic.id] ?? 0,
  }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, POPULAR_SEARCH_COUNT)
    .map((t) => t.id);
}
