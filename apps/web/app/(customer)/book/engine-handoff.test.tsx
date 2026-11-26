import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerBookingPage from './[businessId]/page';
import { CustomerBooking } from '@/components/merchant/booking/customer-booking';
const mocks=vi.hoisted(()=>({enabled:vi.fn(),client:vi.fn()}));
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NEXT_NOT_FOUND');}}));
vi.mock('@/lib/booking/bridge',()=>({bookingEngineEnabledForMerchant:mocks.enabled,MERCHANT_BOOKING_ID:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.client}));
vi.mock('@/components/merchant/booking/customer-booking',()=>({CustomerBooking:()=>null}));
vi.mock('@/components/booking/customer-booking-form',()=>({CustomerBookingForm:()=>null}));
vi.mock('@/components/site-footer',()=>({SiteFooter:()=>null}));
vi.mock('@/components/site-header',()=>({SiteHeader:()=>null}));
const businessId='12345678-1234-4234-8234-123456789abc';
beforeEach(()=>{vi.stubEnv('NODE_ENV','production');mocks.enabled.mockReset().mockReturnValue(true);mocks.client.mockReset().mockImplementation(()=>{throw new Error('legacy-path');});});
afterEach(()=>vi.unstubAllEnvs());
it('explicit engine handoff always renders engine client, never queries the legacy writer path',async()=>{
 const result=await CustomerBookingPage({params:{businessId},searchParams:{source:'engine'}});
 expect(result.type).toBe(CustomerBooking);expect(result.props.businessId).toBe(businessId);expect(mocks.client).not.toHaveBeenCalled();
});
it.each(['not-a-uuid','------------------------------------','local-booking-business'])('strict engine handoff rejects invalid exact business %s',async id=>{
 await expect(CustomerBookingPage({params:{businessId:id},searchParams:{source:'engine'}})).rejects.toThrow('NEXT_NOT_FOUND');expect(mocks.client).not.toHaveBeenCalled();
});
it('disabled engine never falls back to legacy',async()=>{
 mocks.enabled.mockReturnValue(false);await expect(CustomerBookingPage({params:{businessId},searchParams:{source:'engine'}})).rejects.toThrow('NEXT_NOT_FOUND');expect(mocks.client).not.toHaveBeenCalled();
});
it('conflicting resource and duplicate source parameters fail closed',async()=>{
 await expect(CustomerBookingPage({params:{businessId},searchParams:{source:'engine',resource:'legacy-resource'}})).rejects.toThrow('NEXT_NOT_FOUND');
 await expect(CustomerBookingPage({params:{businessId},searchParams:{source:['engine','other']}})).rejects.toThrow('NEXT_NOT_FOUND');expect(mocks.client).not.toHaveBeenCalled();
});
it('ordinary production website route still reaches its unchanged legacy decision path',async()=>{
 await expect(CustomerBookingPage({params:{businessId}})).rejects.toThrow('legacy-path');expect(mocks.client).toHaveBeenCalledOnce();
});