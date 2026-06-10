import AdminClient from './AdminClient';

export function generateStaticParams() {
  return [
    { slug: [] },
    { slug: ['users'] },
    { slug: ['tenders'] },
    { slug: ['tech'] },
  ];
}

export default function AdminPage() {
  return <AdminClient />;
}
