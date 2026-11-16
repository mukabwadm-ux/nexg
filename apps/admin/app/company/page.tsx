import { redirect } from 'next/navigation';

/** Company opens on its files, the first entry in the sidebar group. */
export default function CompanyPage() {
  redirect('/company/files');
}
