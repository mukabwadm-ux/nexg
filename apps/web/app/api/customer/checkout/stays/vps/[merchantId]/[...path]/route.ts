import { nativeVpsStayCheckout } from '@/lib/booking/native-vps-stay-checkout';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function POST(request:Request, context:{params:{merchantId:string;path:string[]}}){
  return nativeVpsStayCheckout(request,context.params);
}
export const GET=POST;
