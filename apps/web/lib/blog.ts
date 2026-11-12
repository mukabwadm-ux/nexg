/**
 * The NexG blog. Posts live here, in the repository, newest first: add one
 * by adding an entry. Each body is a list of blocks (paragraphs, headings and
 * bullet lists), so a post needs no Markdown parser and cannot carry HTML.
 *
 * Posts follow the site's ground rule 3: nothing is described as working
 * until it does, and no figure is printed that we do not have.
 */

export type BlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] };

export interface BlogPost {
  slug: string;
  title: string;
  /** ISO date, Nairobi. */
  date: string;
  category: string;
  excerpt: string;
  /** A photo under public/, used as the card and header image. */
  image: string;
  author: string;
  body: BlogBlock[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'how-we-vet-riders-and-merchants',
    title: 'How we vet every rider and merchant',
    date: '2026-11-11',
    category: 'Trust & safety',
    excerpt:
      'Before anyone delivers to your door or sells through NexG, a person on our team checks their documents by hand. Here is what we check.',
    image: '/images/merchants/grocers.jpg',
    author: 'The NexG team',
    body: [
      {
        type: 'p',
        text: 'A concierge is only as good as the people behind it. When you order through NexG, someone you have never met prepares it and someone else brings it to your room or gate. So before either of them can take work, we check who they are.',
      },
      { type: 'h2', text: 'Riders' },
      {
        type: 'p',
        text: 'Every rider verifies their email, then submits documents that are checked by hand before they can take a single delivery:',
      },
      {
        type: 'ul',
        items: [
          'A national ID',
          'A driving licence, where their vehicle needs one',
          'Insurance',
          'A certificate of good conduct',
          'A photo of themselves',
        ],
      },
      {
        type: 'p',
        text: 'Riders also collect a NexG kit at their onboarding session before their account goes live, so you know who is at your door.',
      },
      { type: 'h2', text: 'Merchants' },
      {
        type: 'p',
        text: 'Merchants register in about ten minutes, and then we verify their business permit, KRA PIN and the rest of their documents by hand. They keep their own prices; NexG handles the delivery.',
      },
      { type: 'h2', text: 'What you see' },
      {
        type: 'p',
        text: 'Only verified, live merchants appear on Explore and in Find Stores Near You. If something about an order is not right, the Help page reaches a real person.',
      },
    ],
  },
  {
    slug: 'welcome-to-nexg',
    title: 'Welcome to NexG: a concierge for wherever you stay',
    date: '2026-11-04',
    category: 'News',
    excerpt:
      'Local stores, vetted riders and a real person on the concierge desk, in one place. Here is what NexG is and who it is for.',
    image: '/images/nairobi-skyline.jpg',
    author: 'The NexG team',
    body: [
      {
        type: 'p',
        text: 'Arrive somewhere new and the simple things get hard: where to eat, where the nearest pharmacy is, who can get you to the airport at five in the morning. NexG is built to answer all of that from one place.',
      },
      { type: 'h2', text: 'What you can do' },
      {
        type: 'ul',
        items: [
          'Order from Nairobi restaurants, pharmacies, groceries, drinks, flowers and laundry, delivered by NexG riders.',
          'Ask the concierge for anything that is not listed. You get a price and a time first, and nothing is bought until you approve it.',
          'Find places to stay, and plan days out to your budget.',
        ],
      },
      { type: 'h2', text: 'Who it is for' },
      {
        type: 'p',
        text: 'Guests in Airbnbs and at home. Hosts who want to give their guests a concierge. Merchants who want to reach guests nearby. And riders who want to deliver across Nairobi.',
      },
      { type: 'h2', text: 'Where we are starting' },
      {
        type: 'p',
        text: 'Nairobi first, neighbourhood by neighbourhood. Set your location on the homepage to see the stores that deliver to you.',
      },
    ],
  },
];

export function blogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function blogDate(iso: string): string {
  return new Date(`${iso}T12:00:00+03:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  });
}
