import { nativeMovieHold } from '@/lib/booking/native-movie-hold';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request, context: { params: { merchantId: string; holdId: string } }) {
  return nativeMovieHold(request, context.params);
}
