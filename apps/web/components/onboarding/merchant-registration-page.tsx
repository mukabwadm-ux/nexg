import Image from 'next/image';
import Link from 'next/link';

import { Logo } from '@/components/logo';

import styles from './merchant-registration-page.module.css';

export function MerchantRegistrationPage({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="NexG home" className={styles.brand}>
          <Logo className={styles.logo} priority />
        </Link>
        <nav className={styles.navigation} aria-label="Registration">
          <Link href="#merchant-benefits" className={styles.navLink}>
            How NexG works
          </Link>
          <Link href="/merchants/sign-in?next=%2Fmerchants%2Fregister" className={styles.signIn}>
            Already on NexG? <span>Sign in</span>
          </Link>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="merchant-page-title">
        <div className={styles.registrationColumn}>
          <div className={styles.intro}>
            <h1 id="merchant-page-title">Bring your business to NexG.</h1>
            <p>
              Create your merchant profile, introduce the products or services you offer, and set up
              your workspace at your own pace.
            </p>
          </div>
          <div id="merchant-registration" className={styles.form}>
            {children}
          </div>
        </div>

        <aside className={styles.feature} aria-labelledby="merchant-feature-title">
          <div className={styles.imageFrame}>
            <Image
              src="/images/merchants/grill-restaurant.jpg"
              alt="A restaurant preparing food for its customers"
              fill
              priority
              sizes="(max-width: 800px) 100vw, 42vw"
              className={styles.image}
            />
          </div>
          <div className={styles.featureCopy}>
            <h2 id="merchant-feature-title">More than a listing.</h2>
            <p>
              Your NexG workspace brings your business profile, offerings, orders and setup progress
              together.
            </p>
            <ul className={styles.featureList}>
              <li>Shape a storefront around your business</li>
              <li>Keep products and services organized</li>
              <li>Follow your application through review</li>
            </ul>
          </div>
        </aside>
      </section>

      <section id="merchant-benefits" className={styles.benefits} aria-labelledby="benefits-title">
        <div className={styles.benefitsHeading}>
          <h2 id="benefits-title">A workspace built around how you do business.</h2>
          <p>Start with the essentials. Add the operational details as you go.</p>
        </div>
        <div className={styles.benefitList}>
          <article className={styles.benefit}>
            <h3>Be easy to find</h3>
            <p>
              Give customers a clear profile for your business and the services or products you
              provide.
            </p>
          </article>
          <article className={styles.benefit}>
            <h3>Keep your offerings in order</h3>
            <p>Organize your catalogue and business details in one merchant workspace.</p>
          </article>
          <article className={styles.benefit}>
            <h3>Know what comes next</h3>
            <p>
              Track your application and complete the required checks before your business goes
              live.
            </p>
          </article>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <h2>Ready to get started?</h2>
          <p>Your registration is the first step. You can finish workspace setup later.</p>
        </div>
        <Link href="#merchant-registration" className={styles.footerAction}>
          Start registration
        </Link>
      </footer>
    </div>
  );
}
