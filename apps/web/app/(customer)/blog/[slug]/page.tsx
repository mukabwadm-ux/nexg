import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { BLOG_POSTS, blogDate, blogPost } from '@/lib/blog';

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = blogPost(params.slug);
  return post ? { title: post.title, description: post.excerpt } : { title: 'Blog' };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = blogPost(params.slug);
  if (!post) notFound();

  return (
    <>
      <SiteHeader />
      <main>
        <article className="mx-auto max-w-[120rem] px-4 pb-20 pt-6 sm:px-[30px]">
          <div className="relative overflow-hidden rounded-[2rem]">
            <span className="relative block aspect-[16/9] max-h-[32rem] w-full sm:aspect-[21/9]">
              <Image src={post.image} alt="" fill priority sizes="100vw" className="object-cover" />
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#0b0907]/90 via-[#0b0907]/40 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10 lg:p-14">
              <p className="text-gold text-xs font-extrabold uppercase tracking-[0.2em]">
                {post.category} · {blogDate(post.date)}
              </p>
              <h1 className="mt-3 max-w-4xl text-3xl/[1.08] font-extrabold tracking-tight sm:text-5xl/[1.06]">
                {post.title}
              </h1>
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-[44rem]">
            <Link
              href="/blog"
              className="text-muted hover:text-ink inline-flex items-center gap-2 text-sm font-bold"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All posts
            </Link>
            <p className="text-muted mt-6 text-sm font-semibold">By {post.author}</p>
            <p className="mt-4 text-xl font-semibold leading-[1.7]">{post.excerpt}</p>

            <div className="mt-8 space-y-6 text-[1.0625rem] leading-[1.85]">
              {post.body.map((block, index) =>
                block.type === 'h2' ? (
                  <h2 key={index} className="pt-4 text-2xl font-extrabold tracking-tight">
                    {block.text}
                  </h2>
                ) : block.type === 'ul' ? (
                  <ul key={index} className="list-disc space-y-2 pl-6 marker:text-[#D9AE2E]">
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={index} className="text-ink/85">
                    {block.text}
                  </p>
                ),
              )}
            </div>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
