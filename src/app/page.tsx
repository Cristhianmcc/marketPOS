import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/session';

export default async function HomePage() {
  const authenticated = await isAuthenticated();
  
  if (authenticated) {
    redirect('/pos');
  } else {
    redirect('/login');
  }
}
