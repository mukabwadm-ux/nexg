import { findCategory } from './taxonomy';
import type { DiscoveryCategory } from './taxonomy';
import restaurantsImage from '../../assets/homepage-features/01-restaurants-kenyan.png';
import groceriesImage from '../../assets/homepage-features/02-groceries.webp';
import marketplaceImage from '../../assets/homepage-features/03-marketplace-tech.webp';
import wellnessImage from '../../assets/homepage-features/04-health-wellness.webp';
import apparelImage from '../../assets/homepage-features/05-apparel-family.png';
import mobilityImage from '../../assets/homepage-features/06-mobility-transfers.webp';
import giftsImage from '../../assets/homepage-features/07-flowers-gifts.webp';
import homeServicesImage from '../../assets/homepage-features/08-laundry-concierge.webp';
import experiencesImage from '../../assets/homepage-features/09-experiences.webp';
import toursImage from '../../assets/homepage-features/10-safari-kenya.png';

interface HomepageFeatureSeed {
  id: string;
  categoryIds: string[];
  title: string;
  description: string;
  action: string;
  accent: string;
  image: string;
}

export interface HomepageFeature extends Omit<HomepageFeatureSeed, 'categoryIds'> {
  category: DiscoveryCategory;
  relatedCategories: DiscoveryCategory[];
}

const featureSeeds: HomepageFeatureSeed[] = [
  {
    id: 'dinner-plans',
    categoryIds: ['restaurants-food', 'alcohol-beverages'],
    title: 'Kenyan classics, shared',
    description: 'Nyama choma, soft ugali and fresh kachumbari. Bring everyone to the table.',
    action: 'Find your feast',
    accent: '#ffb244',
    image: restaurantsImage,
  },
  {
    id: 'everyday-finds',
    categoryIds: ['groceries-essentials'],
    title: 'Fresh picks, close by',
    description: 'Find the ingredients for the meal already on your mind.',
    action: 'Shop fresh picks',
    accent: '#71d19a',
    image: groceriesImage,
  },
  {
    id: 'something-new',
    categoryIds: ['marketplace', 'tech-electronics'],
    title: 'Make everyday better',
    description: 'Discover useful finds that make daily life feel a little easier.',
    action: 'Find your next favourite',
    accent: '#9aabff',
    image: marketplaceImage,
  },
  {
    id: 'care-and-wellness',
    categoryIds: ['health-pharmacy', 'beauty-wellness'],
    title: 'Feel good, every day',
    description: 'Find everyday wellness essentials and small moments of care.',
    action: 'Explore feel-good finds',
    accent: '#d3a1ff',
    image: wellnessImage,
  },
  {
    id: 'personal-style',
    categoryIds: ['fashion-apparel'],
    title: 'Style for everyone',
    description: 'Happy family moments, dressed for whatever the day brings.',
    action: 'Find a family favourite',
    accent: '#ffac8d',
    image: apparelImage,
  },
  {
    id: 'city-mobility',
    categoryIds: ['vehicle-rentals', 'airport-transfers'],
    title: 'Your next trip, sorted',
    description: 'Find an easy way to get there and make more of the day.',
    action: 'Plan your next trip',
    accent: '#75d6e4',
    image: mobilityImage,
  },
  {
    id: 'thoughtful-moments',
    categoryIds: ['flowers-gifts', 'experiences'],
    title: 'Make someone smile',
    description: 'Find flowers and thoughtful gifts for someone on your mind.',
    action: 'Choose a little something',
    accent: '#ff91b1',
    image: giftsImage,
  },
  {
    id: 'more-time',
    categoryIds: ['laundry-cleaning', 'concierge-services'],
    title: 'Get your time back',
    description: 'Hand off a home chore and make room for what matters.',
    action: 'Find home help',
    accent: '#7ed8c8',
    image: homeServicesImage,
  },
  {
    id: 'take-the-scenic-route',
    categoryIds: ['travel-tours'],
    title: 'Kenya is calling',
    description: 'Meet Maasai culture beneath Kilimanjaro’s morning light.',
    action: 'Imagine your safari',
    accent: '#ffd16e',
    image: toursImage,
  },
  {
    id: 'local-experiences',
    categoryIds: ['experiences'],
    title: 'A day to remember',
    description: 'Make room for something new to do, see and remember.',
    action: 'Find an experience',
    accent: '#ff9c72',
    image: experiencesImage,
  },
];

export const homepageFeatures: HomepageFeature[] = featureSeeds.map(({ categoryIds, ...feature }) => {
  const [primaryCategoryId, ...relatedCategoryIds] = categoryIds;
  const category = findCategory(primaryCategoryId);
  if (!category) throw new Error(`Homepage feature references unknown category: ${primaryCategoryId}`);

  return {
    ...feature,
    category,
    relatedCategories: relatedCategoryIds.map((id) => {
      const relatedCategory = findCategory(id);
      if (!relatedCategory) throw new Error(`Homepage feature references unknown category: ${id}`);
      return relatedCategory;
    }),
  };
});
