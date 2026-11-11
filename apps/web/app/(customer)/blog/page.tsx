import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { PageHero } from '@/components/company/page-hero';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { BLOG_POSTS, blogDate } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'News, guides and the thinking behind NexG.',
};

export default function BlogPage() {
  const [lead, ...rest] = BLOG_POSTS;

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Blog"
          title="News and notes"
          gold="from NexG."
          lede="What we are building, how it works, and what we are learning about getting things done in Nairobi."
        />

        <section className="mx-auto max-w-[120rem] px-4 py-16 sm:px-[30px] sm:py-20">
          {!lead ? (
            <p className="text-muted text-lg font-semibold">The first posts are on their way.</p>
          ) : (
            <>
              <Link
                href={`/blog/${lead.slug}`}
                className="border-border bg-surface hover:border-border-strong group grid overflow-hidden rounded-[2rem] border transition-colors lg:grid-cols-2"
              >
                <span className="relative block aspect-[16/10] overflow-hidden lg:aspect-auto lg:min-h-[24rem]">
                  <Image
                    src={lead.image}
                    alt=""
                    fill
                    priority
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </span>
                <span className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
                  <span className="text-gold-text text-xs font-extrabold uppercase tracking-[0.2em]">
                    {lead.category} · {blogDate(lead.date)}
                  </span>
                  <span className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                    {lead.title}
                  </span>
                  <span className="text-muted mt-4 text-base leading-[1.75]">{lead.excerpt}</span>
                  <span className="text-gold-text mt-7 inline-flex items-center gap-3 font-bold">
                    <span className="bg-gold text-ink flex h-8 w-8 items-center justify-center rounded-full transition-transform group-hover:translate-x-1">
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                    Read the post
                  </span>
                </span>
              </Link>

              {rest.length > 0 && (
                <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((post) => (
                    <li key={post.slug}>
                      <Link
                        href={`/blog/${post.slug}`}
                        className="border-border bg-surface hover:border-border-strong group flex h-full flex-col overflow-hidden rounded-[1.5rem] border transition-colors"
                      >
                        <span className="relative block aspect-[16/10] overflow-hidden">
                          <Image
                            src={post.image}
                            alt=""
                            fill
                            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        </span>
                        <span className="flex flex-1 flex-col p-6">
                          <span className="text-gold-text text-xs font-extrabold uppercase tracking-[0.2em]">
                            {post.category} · {blogDate(post.date)}
                          </span>
                          <span className="mt-3 text-xl font-extrabold tracking-tight">
                            {post.title}
                          </span>
                          <span className="text-muted mt-2 flex-1 text-[0.9375rem] leading-[1.7]">
                            {post.excerpt}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
