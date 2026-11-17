import { Sparkles } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FeaturedCard } from '@/components/home/featured-merchants';

import { CreativeVideo } from './creative-video';

describe('a merchant video on a customer page', () => {
  it('is muted, inline and looping with its still, and never set to autoplay', () => {
    const html = renderToStaticMarkup(
      <CreativeVideo
        src="https://media.example/clip.webm"
        poster="https://media.example/still.jpg"
        label="Shop video"
      />,
    );
    expect(html).toContain('muted=""');
    expect(html).toContain('loop=""');
    expect(html).toContain('playsinline=""');
    expect(html).toContain('poster="https://media.example/still.jpg"');
    /* Playback starts in the browser only after reduced motion has been read
       and the video is on screen; nothing is fetched before that. */
    expect(html).not.toContain('autoPlay');
    expect(html).not.toContain('autoplay');
    expect(html).toContain('preload="none"');
    expect(html).toContain('aria-label="Play Shop video"');
  });

  it('sits beside the featured card’s link, never inside it', () => {
    const html = renderToStaticMarkup(
      <FeaturedCard
        href="/discover?merchant=m-1"
        photo={null}
        media={{
          kind: 'video',
          src: 'https://media.example/clip.webm',
          poster: 'https://media.example/still.jpg',
        }}
        icon={Sparkles}
        sponsored="Sponsored"
        minutes={20}
        minUnit="min"
        meta="Charcoal grill"
        name="Choma Kitchen"
        cta="View menu"
      />,
    );
    const link = html.slice(html.indexOf('<a'), html.indexOf('</a>'));
    expect(link).toContain('Choma Kitchen');
    expect(link).not.toContain('<button');
    expect(link).not.toContain('<video');
    expect(html).toContain('Sponsored');
  });

  it('draws an image creative unoptimised, and the cover photo when there is none', () => {
    const base = {
      href: null,
      icon: Sparkles,
      sponsored: 'Sponsored',
      minutes: null,
      minUnit: 'min',
      meta: 'Charcoal grill',
      name: 'Choma Kitchen',
      cta: 'View menu',
    };
    const own = renderToStaticMarkup(
      <FeaturedCard
        {...base}
        photo="/images/cover.jpg"
        media={{ kind: 'image', src: 'https://media.example/card.png' }}
      />,
    );
    expect(own).toContain('https://media.example/card.png');
    expect(own).not.toContain('/images/cover.jpg');
    expect(own).not.toContain('<a');
    const cover = renderToStaticMarkup(<FeaturedCard {...base} photo="/images/cover.jpg" />);
    expect(cover).toContain('cover.jpg');
  });
});
