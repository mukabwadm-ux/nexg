// The review merchants: one per consumer-app category, each a complete
// business with its own merchant-portal login. Read by seed.mjs.
//
// Data only. Names are invented. Item names, descriptions and prices follow
// the owner-approved Nairobi demo catalogue (discovery/demo-seed, 8 Nov 2026).
// No ratings, reviews or orders are created.
//
// Prices are whole KES. `engine` describes the booking-engine offering a
// bookable item opens (seed.mjs creates it and links the item to it).
// `photo` names a photo in photos.mjs.

const westlands = { area: 'Westlands', lat: -1.2648, lng: 36.8078 };
const kilimani = { area: 'Kilimani', lat: -1.2905, lng: 36.7834 };

export const shops = [
  {
    n: 1,
    slug: 'kijiji-grill',
    name: 'Kijiji Grill House',
    legal: 'Kijiji Grill House Limited',
    owner: 'Achieng Odhiambo',
    category: 'restaurants_food',
    subcategory: 'african_cuisine',
    engineProfile: 'restaurant',
    answers: { food_style: 'Kenyan grill: nyama choma, tilapia and pilau', brand_description: 'A Westlands grill house serving charcoal-grilled Kenyan favourites.', holiday_hours: 'Open every day, including public holidays.', order_cancellation_process: 'We call the customer, offer a swap, and refund through NexG if they prefer.', unsafe_delivery_items: 'None.' },
    branch: { ...westlands, name: 'Westlands', address: 'Woodvale Grove, Westlands, Nairobi' },
    prepMinutes: 25,
    minOrder: 500,
    promotion: { name: 'Lunch offer', kind: 'percent', value: 15, item: 'Nyama Choma Platter' },
    groups: [
      { name: 'Choose your side', min: 1, max: 1, options: [['Ugali', 0], ['Chips', 0], ['Pilau rice', 100]] },
      { name: 'Extras', min: 0, max: 3, options: [['Kachumbari', 100], ['Extra sukuma wiki', 80], ['Avocado', 120]] },
      { name: 'Spice level', min: 1, max: 1, options: [['Mild', 0], ['Medium', 0], ['Hot', 0]] },
    ],
    sections: [
      {
        name: 'Grills',
        items: [
          { name: 'Nyama Choma Platter', desc: 'Half a kilo of goat ribs, slow grilled over charcoal.', price: 1450, popular: true, groups: ['Choose your side', 'Extras'], photo: 'nyama-choma' },
          { name: 'Grilled Tilapia', desc: 'Whole Lake Victoria tilapia, lemon and garlic.', price: 1350, groups: ['Choose your side', 'Extras'], photo: 'tilapia' },
          { name: 'Chicken Tikka Skewers', desc: 'Three skewers in a yoghurt and spice marinade.', price: 950, groups: ['Choose your side', 'Spice level'], photo: 'skewers' },
        ],
      },
      {
        name: 'Mains',
        items: [
          { name: 'Beef Pilau', desc: 'Spiced rice with tender beef, served with kachumbari.', price: 850, popular: true, photo: 'pilau' },
          { name: 'Vegetable Curry', desc: 'Seasonal vegetables in a coconut curry.', price: 750, groups: ['Choose your side', 'Spice level'], photo: 'veg-curry' },
          { name: 'Family Combo', desc: 'Nyama choma, grilled chicken, two sides and four sodas. Serves four.', price: 3900, photo: 'combo' },
        ],
      },
      {
        name: 'Drinks',
        items: [
          { name: 'Fresh Passion Juice', desc: 'Pressed to order, no added sugar.', price: 300, photo: 'juice' },
          { name: 'Dawa Mocktail', desc: 'Lime, honey and ginger over crushed ice.', price: 350, photo: 'mocktail' },
        ],
      },
      {
        name: 'Reservations',
        items: [
          {
            name: 'Table for up to 6',
            desc: 'Reserve a table at Westlands. Free to book; you pay for what you order on the day.',
            price: 0,
            kind: 'table',
            photo: 'restaurant-table',
            engine: { model: 'SPACE_RESERVATION', durationMinutes: 90, priceMinor: 0, capacity: 6, resources: [['Table 1', 'space', 6], ['Table 2', 'space', 4], ['Table 3', 'space', 4]] },
          },
        ],
      },
    ],
  },
  {
    n: 2,
    slug: 'shamba-fresh',
    name: 'Shamba Fresh Market',
    legal: 'Shamba Fresh Market Limited',
    owner: 'Peter Kamau',
    category: 'groceries_essentials',
    subcategory: 'fresh_produce',
    branch: { ...kilimani, name: 'Kilimani', address: 'Argwings Kodhek Road, Kilimani, Nairobi' },
    prepMinutes: 20,
    sections: [
      {
        name: 'Fruit & Vegetables',
        items: [
          { name: 'Tomatoes', desc: 'Firm red tomatoes. Weighed when packed; you pay the exact weight.', price: 180, weight: { label: 'kg', step: 0.5, min: 0.5, max: 5 }, photo: 'tomatoes' },
          { name: 'Hass Avocados', desc: 'Ready to eat in two days. Pack of four.', price: 250, sold: 'pack', popular: true, photo: 'avocados' },
          { name: 'Sukuma Wiki', desc: 'Fresh collard greens, one bunch.', price: 50, photo: 'sukuma' },
          { name: 'Bananas', desc: 'Sweet ripe bananas, per kilo.', price: 160, weight: { label: 'kg', step: 0.5, min: 0.5, max: 4 }, photo: 'bananas' },
        ],
      },
      {
        name: 'Butchery',
        items: [
          { name: 'Beef Steak', desc: 'Boneless sirloin, cut to order. Final price after weighing.', price: 900, weight: { label: 'kg', step: 0.25, min: 0.25, max: 3 }, photo: 'beef' },
          { name: 'Whole Chicken', desc: 'Kienyeji chicken, cleaned and dressed.', price: 1100, photo: 'chicken' },
        ],
      },
      {
        name: 'Pantry',
        items: [
          { name: 'Maize Flour 2 kg', desc: 'Sifted white maize meal.', price: 210, photo: 'flour' },
          { name: 'Fresh Milk 1 L', desc: 'Pasteurised whole milk.', price: 140, photo: 'milk' },
          { name: 'Brown Eggs, Tray of 30', desc: 'Farm eggs, graded large.', price: 520, soldOut: true, photo: 'eggs' },
        ],
      },
    ],
  },
  {
    n: 3,
    slug: 'hatua-footwear',
    name: 'Hatua Footwear & Apparel',
    legal: 'Hatua Footwear Limited',
    owner: 'Wanjiru Mwangi',
    category: 'fashion_apparel',
    subcategory: 'shoes',
    branch: { ...westlands, name: 'Westlands', address: 'Mpaka Road, Westlands, Nairobi', lat: -1.2631, lng: 36.8031 },
    prepMinutes: 30,
    sections: [
      {
        name: 'Shoes',
        items: [
          { name: 'Classic Canvas Sneakers', desc: 'Breathable canvas upper, rubber sole.', price: 4500, popular: true, photo: 'sneakers',
            variants: { attributes: [['Size', ['40', '41', '42', '43', '44']], ['Colour', ['Black', 'White']]], soldOut: [['44', 'White']] } },
          { name: 'Leather Loafers', desc: 'Hand-stitched Kenyan leather.', price: 6800, photo: 'loafers',
            variants: { attributes: [['Size', ['40', '41', '42', '43']], ['Colour', ['Brown', 'Black']]] } },
          { name: 'Maasai Beaded Sandals', desc: 'Handmade leather sandals with beadwork.', price: 2200, photo: 'sandals',
            variants: { attributes: [['Size', ['37', '38', '39', '40', '41']]] } },
        ],
      },
      {
        name: 'Clothing',
        items: [
          { name: 'Cotton Crew T-Shirt', desc: '100% cotton, regular fit.', price: 1200, photo: 'tshirt',
            variants: { attributes: [['Size', ['S', 'M', 'L', 'XL']], ['Colour', ['Black', 'White', 'Olive']]], price: { XL: 1400 } } },
          { name: 'Kitenge Shirt', desc: 'Short-sleeved shirt in African print.', price: 2800, photo: 'kitenge',
            variants: { attributes: [['Size', ['S', 'M', 'L', 'XL']]] } },
          { name: 'Denim Jacket', desc: 'Washed denim, button front.', price: 4900, photo: 'denim',
            variants: { attributes: [['Size', ['M', 'L', 'XL']]] } },
        ],
      },
    ],
  },
  {
    n: 4,
    slug: 'mtandao-mobile',
    name: 'Mtandao Mobile',
    legal: 'Mtandao Mobile Limited',
    owner: 'Brian Otieno',
    category: 'tech_electronics',
    subcategory: 'smartphones',
    branch: { ...westlands, name: 'Westlands', address: 'Ring Road Parklands, Westlands, Nairobi', lat: -1.2614, lng: 36.8101 },
    prepMinutes: 10,
    sections: [
      {
        name: 'Travel eSIMs',
        items: [
          { name: 'Kenya eSIM 5 GB, 7 days', desc: 'Data eSIM for Kenya. The activation code arrives in the app; install it in your phone settings.', price: 1500, digital: true, buyerId: true, popular: true, photo: 'esim' },
          { name: 'Kenya eSIM 15 GB, 30 days', desc: 'Data eSIM for Kenya, 30 days.', price: 3500, digital: true, buyerId: true, photo: 'esim' },
          { name: 'East Africa eSIM 10 GB, 15 days', desc: 'Kenya, Uganda, Tanzania and Rwanda.', price: 4200, digital: true, buyerId: true, photo: 'esim' },
        ],
      },
      {
        name: 'Accessories',
        items: [
          { name: 'Silicone Phone Case', desc: 'Soft-touch case with raised edges.', price: 1200, photo: 'phone-case',
            variants: { attributes: [['Model', ['iPhone 15', 'iPhone 16', 'Galaxy S24']], ['Colour', ['Black', 'Blue', 'Red']]] } },
          { name: 'USB-C Fast Charger 25 W', desc: 'Wall charger with USB-C cable.', price: 2500, photo: 'charger' },
          { name: 'Wireless Earbuds', desc: 'Bluetooth 5.3, 24-hour battery with case.', price: 3900, photo: 'earbuds' },
        ],
      },
    ],
  },
  {
    n: 5,
    slug: 'sukari-cakes',
    name: 'Sukari Cakes & Gifts',
    legal: 'Sukari Cakes Limited',
    owner: 'Faith Njeri',
    category: 'flowers_gifts',
    subcategory: 'occasion_gifts',
    branch: { ...kilimani, name: 'Kilimani', address: 'Ngong Road, Kilimani, Nairobi', lat: -1.2989, lng: 36.7861 },
    prepMinutes: 60,
    sections: [
      {
        name: 'Cakes',
        items: [
          { name: 'Chocolate Fudge Cake 1 kg', desc: 'Rich chocolate sponge with fudge icing. Add a message for the top.', price: 2800, popular: true, message: { label: 'Message on the cake', max: 40 }, photo: 'chocolate-cake' },
          { name: 'Red Velvet Cake 1 kg', desc: 'Cream cheese frosting.', price: 3000, message: { label: 'Message on the cake', max: 40 }, photo: 'red-velvet' },
          { name: 'Cupcakes, Box of 6', desc: 'Vanilla and chocolate, buttercream swirl.', price: 1200, photo: 'cupcakes' },
        ],
      },
      {
        name: 'Flowers & Gifts',
        items: [
          { name: 'Red Rose Bouquet', desc: 'Twelve long-stem Kenyan roses.', price: 2500, message: { label: 'Card message', max: 120 }, photo: 'roses' },
          { name: 'Mixed Flower Box', desc: 'Seasonal flowers in a keepsake box.', price: 3200, message: { label: 'Card message', max: 120 }, photo: 'flower-box' },
          { name: 'Gift Hamper', desc: 'Chocolates, Kenyan tea, coffee and biscuits.', price: 4500, photo: 'hamper' },
        ],
      },
    ],
  },
  {
    n: 6,
    slug: 'nyumba-living',
    name: 'Nyumba Living',
    legal: 'Nyumba Living Limited',
    owner: 'James Kariuki',
    category: 'marketplace',
    subcategory: 'home_living',
    branch: { ...westlands, name: 'Westlands', address: 'Waiyaki Way, Westlands, Nairobi', lat: -1.2589, lng: 36.7986 },
    prepMinutes: 30,
    sections: [
      {
        name: 'Kitchen',
        items: [
          { name: 'Ceramic Mug Set of 4', desc: 'Hand-glazed stoneware mugs.', price: 1800, popular: true, photo: 'mugs' },
          { name: 'Cast Iron Skillet 26 cm', desc: 'Pre-seasoned, oven safe.', price: 3500, photo: 'skillet' },
          { name: 'Olive Wood Serving Board', desc: 'Kenyan olive wood, hand finished.', price: 2400, photo: 'board' },
        ],
      },
      {
        name: 'Home',
        items: [
          { name: 'Kikoy Throw Blanket', desc: 'Woven cotton throw, 130 x 170 cm.', price: 2900, photo: 'throw' },
          { name: 'Sisal Storage Basket', desc: 'Handwoven sisal, medium.', price: 1600, photo: 'basket' },
          { name: 'Scented Candle', desc: 'Soy wax, lemongrass and ginger.', price: 1100, photo: 'candle' },
        ],
      },
    ],
  },
  {
    n: 7,
    slug: 'utulivu-spa',
    name: 'Utulivu Spa & Fitness',
    legal: 'Utulivu Wellness Limited',
    owner: 'Grace Wambui',
    category: 'wellness',
    subcategory: 'gym',
    engineProfile: 'spa',
    branch: { ...westlands, name: 'Westlands', address: 'Rhapta Road, Westlands, Nairobi', lat: -1.2672, lng: 36.8045 },
    prepMinutes: 0,
    sections: [
      {
        name: 'Massage',
        items: [
          { name: 'Swedish Massage, 60 min', desc: 'Full-body relaxation massage. Choose your therapist.', price: 3500, kind: 'appointment', popular: true, duration: 60, photo: 'massage',
            engine: { model: 'APPOINTMENT', durationMinutes: 60, priceMinor: 350000, choose: true, resources: [['Therapist Amina', 'staff', 1], ['Therapist Kevin', 'staff', 1]] } },
          { name: 'Deep Tissue Massage, 90 min', desc: 'Firm pressure for tight muscles.', price: 5000, kind: 'appointment', duration: 90, photo: 'deep-tissue',
            engine: { model: 'APPOINTMENT', durationMinutes: 90, priceMinor: 500000, choose: true, resources: [['Therapist Amina', 'staff', 1], ['Therapist Kevin', 'staff', 1]] } },
          { name: 'Express Facial, 45 min', desc: 'Cleanse, exfoliate and hydrate.', price: 2800, kind: 'appointment', duration: 45, photo: 'facial',
            engine: { model: 'APPOINTMENT', durationMinutes: 45, priceMinor: 280000, resources: [['Treatment Room', 'space', 1]] } },
        ],
      },
      {
        name: 'Fitness',
        items: [
          { name: 'Personal Training Session, 60 min', desc: 'One-to-one session with a coach.', price: 2000, kind: 'appointment', duration: 60, photo: 'personal-training',
            engine: { model: 'APPOINTMENT', durationMinutes: 60, priceMinor: 200000, resources: [['Coach Daniel', 'staff', 1]] } },
          { name: 'Monthly Gym Membership', desc: '30 days of gym access, including 8 personal training sessions.', price: 6000, kind: 'pass', photo: 'gym',
            engine: { model: 'ENTITLEMENT', priceMinor: 600000, validityDays: 30, credits: 8, childItem: 'Personal Training Session, 60 min' } },
        ],
      },
    ],
  },
  {
    n: 8,
    slug: 'sauti-live',
    name: 'Sauti Live Events',
    legal: 'Sauti Live Events Limited',
    owner: 'Kevin Mutua',
    category: 'experiences',
    subcategory: 'concerts_festivals',
    engineProfile: 'concerts',
    branch: { ...westlands, name: 'Westlands', address: 'Parklands Road, Westlands, Nairobi', lat: -1.2607, lng: 36.8139 },
    prepMinutes: 0,
    sections: [
      {
        name: 'Concerts',
        items: [
          { name: 'Sunset Acoustic Evening', desc: 'Live acoustic sets on the rooftop, every evening at 18:30.', price: 1500, kind: 'ticket', popular: true, photo: 'concert',
            engine: { model: 'SESSION_CAPACITY', durationMinutes: 150, priceMinor: 150000, capacity: 120, daily: '18:30',
              ticketTypes: [{ id: 'regular', name: 'Regular', priceMinor: 150000, maxPerBooking: 8 }, { id: 'vip', name: 'VIP (front seats, one drink)', priceMinor: 400000, maxPerBooking: 4 }] } },
          { name: 'Saturday Jazz Brunch', desc: 'Jazz trio and brunch, Saturdays at 11:00.', price: 2500, kind: 'ticket', photo: 'jazz',
            engine: { model: 'SESSION_CAPACITY', durationMinutes: 180, priceMinor: 250000, capacity: 60, weekly: [5], time: '11:00',
              ticketTypes: [{ id: 'adult', name: 'Adult', priceMinor: 250000, maxPerBooking: 6 }, { id: 'child', name: 'Child under 12', priceMinor: 120000, maxPerBooking: 4 }] } },
          { name: 'Friday Comedy Night', desc: 'Stand-up from Nairobi comedians, Fridays at 20:00.', price: 1000, kind: 'ticket', photo: 'comedy',
            engine: { model: 'SESSION_CAPACITY', durationMinutes: 120, priceMinor: 100000, capacity: 100, weekly: [4], time: '20:00',
              ticketTypes: [{ id: 'regular', name: 'Regular', priceMinor: 100000, maxPerBooking: 8 }, { id: 'table', name: 'Table for 4', priceMinor: 450000, maxPerBooking: 2 }] } },
        ],
      },
      {
        name: 'Private Events',
        items: [
          { name: 'Private Event Package', desc: 'Venue, sound, lighting and host for a birthday, launch or celebration. We confirm the exact price after your brief; reserve with a 50% deposit.', price: 50000, kind: 'request', photo: 'private-event',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 5000000, quoteRange: { minMinor: 5000000, maxMinor: 15000000, note: 'Up to 80 guests, 5 hours.' } } },
          { name: 'Corporate Event Package', desc: 'Team nights, launches and year-end parties with catering, sound and a host. Reserve with a 50% deposit once we confirm the price.', price: 150000, kind: 'request', photo: 'corporate-event',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 15000000, quoteRange: { minMinor: 15000000, maxMinor: 50000000, note: '30 to 200 guests.' } } },
        ],
      },
    ],
  },
  {
    n: 9,
    slug: 'nyota-cinemas',
    name: 'Nyota Cinemas',
    legal: 'Nyota Cinemas Limited',
    owner: 'Samuel Kiprono',
    category: 'experiences',
    subcategory: 'cinemas',
    cinema: true,
    branch: { ...westlands, name: 'Westlands', address: 'Chiromo Road, Westlands, Nairobi', lat: -1.2701, lng: 36.8089 },
    prepMinutes: 0,
    sections: [
      {
        name: 'Snacks',
        items: [
          { name: 'Popcorn, Large', desc: 'Salted or caramel.', price: 450, photo: 'popcorn' },
          { name: 'Soda', desc: '500 ml.', price: 200, photo: 'soda' },
          { name: 'Nachos with Cheese', desc: 'Warm cheese dip.', price: 550, photo: 'nachos' },
          { name: 'Combo: Popcorn and Two Sodas', desc: 'Large popcorn and two sodas.', price: 750, photo: 'popcorn' },
          { name: 'Bottled Water', desc: '500 ml.', price: 100, photo: 'water' },
        ],
      },
    ],
  },
  {
    n: 10,
    slug: 'uwanja-arena',
    name: 'Uwanja Courts & Karting',
    legal: 'Uwanja Sports Limited',
    owner: 'Dennis Omondi',
    category: 'games_sports',
    subcategory: 'football_basketball_tennis',
    engineProfile: 'sports_activities',
    branch: { ...kilimani, name: 'Kilimani', address: 'Lenana Road, Kilimani, Nairobi', lat: -1.2952, lng: 36.7898 },
    prepMinutes: 0,
    sections: [
      {
        name: 'Courts',
        items: [
          { name: 'Padel Court, 1 hour', desc: 'Indoor padel court for up to 4 players. Rackets included.', price: 3000, kind: 'table', popular: true, duration: 60, party: [2, 4], photo: 'padel',
            engine: { model: 'SPACE_RESERVATION', durationMinutes: 60, priceMinor: 300000, capacity: 4, resources: [['Padel Court 1', 'space', 4], ['Padel Court 2', 'space', 4]] } },
          { name: '5-a-side Football Pitch, 1 hour', desc: 'Floodlit artificial turf for up to 12 players.', price: 4500, kind: 'table', duration: 60, party: [6, 12], photo: 'football',
            engine: { model: 'SPACE_RESERVATION', durationMinutes: 60, priceMinor: 450000, capacity: 12, resources: [['Pitch A', 'space', 12]] } },
          { name: 'Tennis Court, 1 hour', desc: 'Hard court for singles or doubles. Balls available at the desk.', price: 2000, kind: 'table', duration: 60, party: [2, 4], photo: 'tennis',
            engine: { model: 'SPACE_RESERVATION', durationMinutes: 60, priceMinor: 200000, capacity: 4, resources: [['Tennis Court 1', 'space', 4]] } },
        ],
      },
      {
        name: 'Karting',
        items: [
          { name: 'Go-Karting, 15-minute session', desc: 'Sessions at 11:00, 14:00, 17:00 and 19:00. Helmet and briefing included.', price: 2000, kind: 'ticket', photo: 'karting',
            engine: { model: 'SESSION_CAPACITY', durationMinutes: 15, priceMinor: 200000, capacity: 8, departures: ['11:00', '14:00', '17:00', '19:00'],
              ticketTypes: [{ id: 'driver', name: 'Driver', priceMinor: 200000, maxPerBooking: 8 }] } },
          { name: 'Birthday Party Package', desc: 'Karting, a court and a party room for up to 20 guests. We quote, you reserve with a 50% deposit.', price: 25000, kind: 'request', photo: 'party',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 2500000, quoteRange: { minMinor: 2500000, maxMinor: 6000000, note: 'Up to 20 guests, 3 hours.' } } },
        ],
      },
    ],
  },
  {
    n: 11,
    slug: 'mjini-tours',
    name: 'Mjini Safaris & Tours',
    legal: 'Mjini Safaris Limited',
    owner: 'Joseph Lekishon',
    category: 'travel_tours',
    subcategory: 'city_cultural_tours',
    engineProfile: 'city_tours',
    branch: { ...westlands, name: 'Westlands', address: 'Muthithi Road, Westlands, Nairobi', lat: -1.2622, lng: 36.8057 },
    prepMinutes: 0,
    sections: [
      {
        name: 'Day Tours',
        items: [
          { name: 'Nairobi City Highlights Tour', desc: 'Half day: city centre, National Archives, Kazuri Beads and the Giraffe Centre. Hotel pickup included.', price: 4500, kind: 'trip', popular: true, pricePer: 'person', duration: 300, photo: 'city-tour',
            engine: { model: 'TOUR', durationMinutes: 300, priceMinor: 450000, capacity: 12, departures: ['09:00', '14:00'], itinerary: 'City centre, National Archives, Kazuri Beads, Giraffe Centre' } },
          { name: 'Nairobi National Park Game Drive', desc: 'Morning game drive with a guide, park fees included.', price: 9500, kind: 'trip', pricePer: 'person', duration: 300, photo: 'game-drive',
            engine: { model: 'TOUR', durationMinutes: 300, priceMinor: 950000, capacity: 6, departures: ['06:00'], itinerary: 'East Gate, hippo pools, Ivory Burning Site' } },
          { name: 'Karura Forest Guided Walk', desc: 'Two-hour guided walk to the waterfall and caves.', price: 2500, kind: 'trip', pricePer: 'person', duration: 150, photo: 'forest-walk',
            engine: { model: 'TOUR', durationMinutes: 150, priceMinor: 250000, capacity: 15, departures: ['07:30'], itinerary: 'Limuru Road gate, waterfall, Mau Mau caves, bamboo forest' } },
          { name: 'Lake Naivasha Day Trip', desc: 'Boat ride, Crescent Island walking safari and lunch. Return by 18:00.', price: 12500, kind: 'trip', pricePer: 'person', duration: 660, photo: 'naivasha',
            engine: { model: 'TOUR', durationMinutes: 660, priceMinor: 1250000, capacity: 7, departures: ['07:00'], itinerary: 'Rift Valley viewpoint, Lake Naivasha boat ride, Crescent Island, lunch' } },
        ],
      },
      {
        name: 'Packages',
        items: [
          { name: 'Custom Safari Package', desc: 'Maasai Mara, Amboseli or Naivasha, planned to your dates and budget. Reserve with a 50% deposit once we confirm the price.', price: 60000, kind: 'request', photo: 'safari',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 6000000, quoteRange: { minMinor: 6000000, maxMinor: 25000000, note: 'Per group, 2 to 5 days.' } } },
        ],
      },
    ],
  },
  {
    n: 12,
    slug: 'karibu-transfers',
    name: 'Karibu Airport Transfers',
    legal: 'Karibu Transfers Limited',
    owner: 'Hassan Abdi',
    category: 'airport_transfers',
    subcategory: 'airport_pickup',
    engineProfile: 'airport_pickup',
    branch: { ...westlands, name: 'Westlands', address: 'General Mathenge Drive, Westlands, Nairobi', lat: -1.2571, lng: 36.8017 },
    prepMinutes: 0,
    sections: [
      {
        name: 'Sedan',
        items: [
          { name: 'Sedan: JKIA to Westlands', desc: 'Pickup at Jomo Kenyatta International Airport arrivals. Up to 3 passengers and 3 bags.', price: 3000, kind: 'transfer', popular: true, photo: 'sedan',
            engine: { model: 'TRANSFER', durationMinutes: 60, priceMinor: 300000, passengers: 3, direction: 'pickup', resources: [['Toyota Premio KDA 101X', 'vehicle', 3], ['Driver Juma', 'staff', 1]] } },
          { name: 'Sedan: Westlands to JKIA', desc: 'Drop-off at Jomo Kenyatta International Airport departures. Up to 3 passengers.', price: 3000, kind: 'transfer', photo: 'sedan',
            engine: { model: 'TRANSFER', durationMinutes: 60, priceMinor: 300000, passengers: 3, direction: 'drop-off', resources: [['Toyota Premio KDA 101X', 'vehicle', 3], ['Driver Juma', 'staff', 1]] } },
        ],
      },
      {
        name: 'Van',
        items: [
          { name: 'Van: JKIA to Westlands', desc: 'Toyota Hiace for up to 7 passengers and luggage.', price: 5500, kind: 'transfer', photo: 'van',
            engine: { model: 'TRANSFER', durationMinutes: 60, priceMinor: 550000, passengers: 7, direction: 'pickup', resources: [['Toyota Hiace KDB 202Y', 'vehicle', 7], ['Driver Otieno', 'staff', 1]] } },
          { name: 'SUV: JKIA to Westlands', desc: 'Toyota Land Cruiser Prado for up to 5 passengers and 5 bags.', price: 4500, kind: 'transfer', photo: 'prado',
            engine: { model: 'TRANSFER', durationMinutes: 60, priceMinor: 450000, passengers: 5, direction: 'pickup', resources: [['Toyota Prado KDE 505B', 'vehicle', 5], ['Driver Kiprotich', 'staff', 1]] } },
        ],
      },
      {
        name: 'Meet & Greet',
        items: [
          { name: 'Meet & Greet at JKIA', desc: 'A greeter meets you at arrivals with your name and walks you to your car.', price: 2000, kind: 'transfer', photo: 'meet-greet',
            engine: { model: 'TRANSFER', durationMinutes: 45, priceMinor: 200000, passengers: 4, direction: 'pickup', greeter: true, resources: [['Greeter Wairimu', 'staff', 1]] } },
        ],
      },
    ],
  },
  {
    n: 13,
    slug: 'gari-car-hire',
    name: 'Gari Car Hire',
    legal: 'Gari Car Hire Limited',
    owner: 'Moses Cheruiyot',
    category: 'vehicle_rentals',
    subcategory: 'car_rental',
    engineProfile: 'car_rental',
    branch: { ...westlands, name: 'Westlands', address: 'Lower Kabete Road, Westlands, Nairobi', lat: -1.2553, lng: 36.8001 },
    prepMinutes: 0,
    sections: [
      {
        name: 'Cars',
        items: [
          { name: 'Toyota Axio (Sedan)', desc: 'Automatic, 5 seats, air conditioning, 200 km a day included. Self-drive or with a driver.', price: 4500, kind: 'rental', popular: true, pricePer: 'day', photo: 'axio',
            rental: { seats: 5, carType: 'sedan', terms: ['free_cancellation', 'insurance_included', 'air_conditioning', 'airport_pickup'] },
            engine: { model: 'ASSET_INTERVAL', priceMinor: 450000, perDay: true, resources: [['Toyota Axio KDC 303Z', 'vehicle', 1]],
              rentalTerms: { depositMinor: 1000000, minimumUnits: 1, includedDistanceKm: 200, pickupNote: 'Pickup at Westlands or JKIA.', terms: 'Valid driving licence and ID at pickup. Return with the same fuel level.' } } },
          { name: 'Toyota Prado (SUV 4x4)', desc: 'Automatic, 7 seats, four-wheel drive, unlimited mileage.', price: 12000, kind: 'rental', pricePer: 'day', photo: 'prado',
            rental: { seats: 7, carType: 'suv', terms: ['unlimited_mileage', 'insurance_included', 'four_wheel_drive', 'air_conditioning'] },
            engine: { model: 'ASSET_INTERVAL', priceMinor: 1200000, perDay: true, resources: [['Toyota Prado KDD 404A', 'vehicle', 1]],
              rentalTerms: { depositMinor: 3000000, minimumUnits: 1, pickupNote: 'Pickup at Westlands.', terms: 'Valid driving licence and ID at pickup.' } } },
          { name: 'Mountain Bike', desc: 'Hardtail mountain bike with helmet and lock.', price: 1200, kind: 'rental', pricePer: 'day', photo: 'bike',
            engine: { model: 'ASSET_INTERVAL', priceMinor: 120000, perDay: true, resources: [['Mountain Bike 1', 'vehicle', 1]],
              rentalTerms: { depositMinor: 500000, minimumUnits: 1, terms: 'ID at pickup.' } } },
          { name: 'Corporate Fleet Hire', desc: 'Several cars for a team or event, by the week or month. We quote, you reserve with a 50% deposit.', price: 50000, kind: 'request', photo: 'fleet',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 5000000, quoteRange: { minMinor: 5000000, maxMinor: 30000000, note: 'Weekly or monthly fleet hire.' } } },
        ],
      },
      {
        name: 'Car Care',
        items: [
          { name: 'Full Car Wash', desc: 'Exterior wash, interior vacuum and tyre shine. About 45 minutes.', price: 1000, kind: 'service', photo: 'car-wash',
            engine: { model: 'SERVICE_JOB', durationMinutes: 45, priceMinor: 100000, resources: [['Wash Bay 1', 'space', 1], ['Wash Team', 'staff', 1]] } },
          { name: 'Monthly Car Wash Plan', desc: 'Four full washes in 30 days.', price: 3200, kind: 'pass', photo: 'car-wash',
            engine: { model: 'ENTITLEMENT', priceMinor: 320000, validityDays: 30, credits: 4, childItem: 'Full Car Wash' } },
        ],
      },
    ],
  },
  {
    n: 14,
    slug: 'safi-laundry',
    name: 'Safi Laundry & Cleaning',
    legal: 'Safi Laundry Limited',
    owner: 'Lucy Akinyi',
    category: 'laundry_cleaning',
    subcategory: 'washing_dry_cleaning',
    engineProfile: 'laundry',
    branch: { ...kilimani, name: 'Kilimani', address: 'Kindaruma Road, Kilimani, Nairobi', lat: -1.2928, lng: 36.7882 },
    prepMinutes: 0,
    sections: [
      {
        name: 'Laundry',
        items: [
          { name: 'Wash & Fold, per kg', desc: 'Drop off or we collect; washed, dried and folded. Choose your drop-off and collection windows.', price: 250, kind: 'service', popular: true, photo: 'laundry',
            engine: { model: 'LINKED_WINDOWS', priceMinor: 25000, perKg: true, capacityKg: 60 } },
          { name: 'Dry Cleaning: Suit', desc: 'Two-piece suit, pressed.', price: 900, kind: 'service', photo: 'dry-cleaning',
            engine: { model: 'LINKED_WINDOWS', priceMinor: 90000, capacityKg: 60, perItem: true } },
          { name: 'Ironing, per item', desc: 'Shirts, trousers and dresses pressed and hung.', price: 80, kind: 'service', photo: 'ironing',
            engine: { model: 'LINKED_WINDOWS', priceMinor: 8000, capacityKg: 60, perItem: true } },
        ],
      },
      {
        name: 'Home Cleaning',
        items: [
          { name: 'Home Cleaning, 3 hours', desc: 'Two cleaners at your home with supplies. Kilimani, Westlands, Lavington and CBD.', price: 3500, kind: 'appointment', duration: 180, photo: 'home-cleaning',
            engine: { model: 'FIELD_VISIT', durationMinutes: 180, priceMinor: 350000, areas: ['Kilimani', 'Westlands', 'Lavington', 'CBD'], resources: [['Cleaning Team A', 'staff', 1]] } },
          { name: 'Office Cleaning, 4 hours', desc: 'Two cleaners for offices up to 150 m², supplies included.', price: 5500, kind: 'appointment', duration: 240, photo: 'office-cleaning',
            engine: { model: 'FIELD_VISIT', durationMinutes: 240, priceMinor: 550000, areas: ['Kilimani', 'Westlands', 'Upper Hill', 'CBD'], resources: [['Cleaning Team B', 'staff', 1]] } },
        ],
      },
    ],
  },
  {
    n: 15,
    slug: 'faraja-concierge',
    name: 'Faraja Concierge',
    legal: 'Faraja Concierge Limited',
    owner: 'Esther Chebet',
    category: 'concierge_services',
    subcategory: 'personal_assistance',
    engineProfile: 'personal_assistance',
    branch: { ...westlands, name: 'Westlands', address: 'Brookside Drive, Westlands, Nairobi', lat: -1.2594, lng: 36.8073 },
    prepMinutes: 0,
    sections: [
      {
        name: 'Concierge',
        items: [
          { name: 'Personal Assistant for a Day', desc: 'Errands, bookings and queues handled for you, 8 hours.', price: 8000, kind: 'request', popular: true, photo: 'assistant',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 800000, quoteRange: { minMinor: 800000, maxMinor: 1500000, note: 'Depends on errands and travel.' } } },
          { name: 'Restaurant & Event Reservations', desc: 'We find and book the table or tickets you want.', price: 2000, kind: 'request', photo: 'reservations',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 200000, quoteRange: { minMinor: 200000, maxMinor: 500000 } } },
          { name: 'Gift Sourcing & Delivery', desc: 'Tell us the person and the budget; we find, wrap and deliver.', price: 3000, kind: 'request', photo: 'gift-sourcing',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 300000, quoteRange: { minMinor: 300000, maxMinor: 2000000 } } },
          { name: 'Airport VIP Assistance', desc: 'Fast-track, lounge access and porter at JKIA.', price: 6500, kind: 'request', photo: 'meet-greet',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 650000, quoteRange: { minMinor: 650000, maxMinor: 1200000 } } },
          { name: 'Personal Shopping', desc: 'A shopper buys and delivers your list from any Nairobi store.', price: 1500, kind: 'request', photo: 'shopping',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 150000, quoteRange: { minMinor: 150000, maxMinor: 500000, note: 'Service fee; goods paid at cost.' } } },
        ],
      },
    ],
  },
  {
    n: 16,
    slug: 'mvinyo-cellar',
    name: 'Mvinyo Wine Cellar',
    legal: 'Mvinyo Cellar Limited',
    owner: 'Robert Waweru',
    category: 'alcohol_beverages',
    subcategory: 'wines_champagne',
    restricted: true,
    branch: { ...westlands, name: 'Westlands', address: 'Peponi Road, Westlands, Nairobi', lat: -1.2551, lng: 36.8045 },
    prepMinutes: 15,
    sections: [
      {
        name: 'Wine',
        items: [
          { name: 'South African Shiraz 750 ml', desc: 'Full-bodied red.', price: 1800, age: true, popular: true, photo: 'red-wine' },
          { name: 'Sauvignon Blanc 750 ml', desc: 'Crisp and dry white.', price: 1650, age: true, photo: 'white-wine' },
          { name: 'Prosecco 750 ml', desc: 'Italian sparkling wine.', price: 2400, age: true, photo: 'prosecco' },
        ],
      },
      {
        name: 'Beer & Soft Drinks',
        items: [
          { name: 'Craft Lager, 6-pack', desc: 'Kenyan craft lager, 330 ml bottles.', price: 1500, age: true, photo: 'beer' },
          { name: 'Tonic Water, 4-pack', desc: 'Premium tonic.', price: 600, photo: 'tonic' },
          { name: 'Ice, 2 kg bag', desc: 'Party ice.', price: 250, photo: 'ice' },
        ],
      },
    ],
  },
  {
    n: 17,
    slug: 'afya-pharmacy',
    name: 'Afya Bora Pharmacy',
    legal: 'Afya Bora Pharmacy Limited',
    owner: 'Dr. Mercy Nyambura',
    category: 'pharmacy',
    subcategory: 'prescription_otc_medication',
    answers: { dispenses_rx: 'no' },
    branch: { ...kilimani, name: 'Kilimani', address: 'Ralph Bunche Road, Kilimani, Nairobi', lat: -1.2943, lng: 36.7949 },
    prepMinutes: 15,
    sections: [
      {
        name: 'Everyday Health',
        items: [
          { name: 'Paracetamol 500 mg, 24 tablets', desc: 'Pain and fever relief. Read the leaflet before use.', price: 150, photo: 'tablets' },
          { name: 'Oral Rehydration Salts, 10 sachets', desc: 'For dehydration.', price: 300, photo: 'ors' },
          { name: 'Vitamin C 1000 mg, 30 tablets', desc: 'Effervescent, orange flavour.', price: 850, popular: true, photo: 'vitamins' },
        ],
      },
      {
        name: 'Personal Care',
        items: [
          { name: 'SPF 50 Sunscreen 100 ml', desc: 'Broad spectrum, water resistant.', price: 1600, photo: 'sunscreen' },
          { name: 'First Aid Kit', desc: 'Plasters, bandages, antiseptic and gloves.', price: 1900, photo: 'first-aid' },
          { name: 'Digital Thermometer', desc: 'Reads in 10 seconds.', price: 700, photo: 'thermometer' },
        ],
      },
    ],
  },
  {
    n: 18,
    slug: 'faragha-wellness',
    name: 'Faragha Wellness',
    legal: 'Faragha Wellness Limited',
    owner: 'Nancy Wairimu',
    category: 'adults_only',
    subcategory: 'sexual_health_products',
    restricted: true,
    branch: { ...westlands, name: 'Westlands', address: 'Ojijo Road, Westlands, Nairobi', lat: -1.2633, lng: 36.8118 },
    prepMinutes: 15,
    sections: [
      {
        name: 'Sexual Health',
        items: [
          { name: 'Condoms, 12-pack', desc: 'Latex condoms. Discreet packaging. For adults 18 and over.', price: 650, popular: true, photo: 'condoms' },
          { name: 'Water-based Lubricant 100 ml', desc: 'Fragrance free. For adults 18 and over.', price: 900, photo: 'lubricant' },
          { name: 'Pregnancy Test, 2-pack', desc: 'Results in 3 minutes.', price: 450, photo: 'pregnancy-test' },
          { name: 'Intimate Wash 250 ml', desc: 'pH balanced, gentle.', price: 800, photo: 'intimate-wash' },
          { name: 'Self-care Gift Box', desc: 'Bath salts, candle and massage oil, discreetly wrapped.', price: 2500, photo: 'self-care-box' },
        ],
      },
    ],
  },
  {
    n: 19,
    slug: 'anga-charters',
    name: 'Anga Air Charters',
    legal: 'Anga Air Charters Limited',
    owner: 'Captain Ian Mburu',
    category: 'flights',
    subcategory: 'private_charters',
    engineProfile: 'travel_packages',
    branch: { area: 'Langata', lat: -1.3216, lng: 36.8148, name: 'Wilson Airport', address: 'Wilson Airport, Langata Road, Nairobi' },
    prepMinutes: 0,
    sections: [
      {
        name: 'Charters',
        items: [
          { name: 'Private Charter: Nairobi to Maasai Mara', desc: 'Cessna Caravan from Wilson Airport, up to 12 passengers. We confirm the price for your date; reserve with a 50% deposit.', price: 280000, kind: 'request', popular: true, photo: 'charter',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 28000000, quoteRange: { minMinor: 28000000, maxMinor: 45000000, note: 'Return flight, same day or overnight.' } } },
          { name: 'Helicopter Charter: Nairobi Scenic Flight', desc: '30 minutes over Nairobi National Park and the city, up to 4 passengers.', price: 95000, kind: 'request', photo: 'helicopter',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 9500000, quoteRange: { minMinor: 9500000, maxMinor: 14000000, note: 'Depends on route and time.' } } },
          { name: 'Private Charter: Nairobi to Diani', desc: 'Light aircraft to Ukunda airstrip, up to 6 passengers.', price: 350000, kind: 'request', photo: 'charter',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 35000000, quoteRange: { minMinor: 35000000, maxMinor: 52000000, note: 'One way or return.' } } },
          { name: 'Scenic Flight: Mount Kenya', desc: 'Light aircraft over Mount Kenya peaks, about 2 hours, up to 5 passengers.', price: 180000, kind: 'request', photo: 'mount-kenya',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 18000000, quoteRange: { minMinor: 18000000, maxMinor: 26000000, note: 'Weather permitting.' } } },
          { name: 'Safari Flight: Wilson to Amboseli', desc: 'Scheduled-style charter to Amboseli, up to 12 passengers.', price: 220000, kind: 'request', photo: 'amboseli',
            engine: { model: 'REQUEST_QUOTE', priceMinor: 22000000, quoteRange: { minMinor: 22000000, maxMinor: 34000000, note: 'Return flight.' } } },
        ],
      },
    ],
  },
];
