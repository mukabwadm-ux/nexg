import { notFound } from 'next/navigation';
import { AviationDemoPage } from '@/components/merchant/aviation/demo-page';
import { createAviationDemoContext } from '@/lib/aviation-demo';

export default function HeliflightMeetingDemo() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <AviationDemoPage active="Home" demoContext={createAviationDemoContext()} />;
}
