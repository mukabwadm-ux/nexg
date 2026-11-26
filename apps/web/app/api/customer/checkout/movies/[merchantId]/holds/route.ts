import { nativeMovieHold } from '@/lib/booking/native-movie-hold';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request, context: { params: { merchantId: string } }) {
  return nativeMovieHold(request, context.params);
}
