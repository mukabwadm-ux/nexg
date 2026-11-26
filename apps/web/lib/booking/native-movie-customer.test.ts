import { beforeEach, describe, expect, it, vi } from 'vitest';
const getUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/customer-api', () => ({ customerApiClient: () => ({ auth: { getUser } }) }));
import { resolveNativeMovieCustomer } from './native-movie-customer';
const id = '01a12345-168a-4456-8b79-012345678910';
const profile = { id, user_metadata: { full_name: ' Cinema Guest ', email: 'untrusted@example.test' }, email: 'guest@example.test', phone: '254712000000' };
const token = 'header.payload.signature';
const request = (withToken = true) => new Request('https://www.example.test', { headers: withToken ? { authorization: 'Bearer '+token } : {} });
const reply = (user: unknown) => getUser.mockResolvedValue({ data: { user }, error: null });
describe('native Movies customer resolution', () => {
  beforeEach(() => { getUser.mockReset(); });
  it('does not accept a missing bearer or a browser cookie', async () => {
    expect(await resolveNativeMovieCustomer(request(false))).toEqual({ok:false,reason:'sign_in'});
    expect(getUser).not.toHaveBeenCalled();
  });
  it('uses exactly the confirmed email from the verified Auth user', async () => {
    reply({...profile,email_confirmed_at:'2026-01-01',phone_confirmed_at:'2026-01-01'});
    expect(await resolveNativeMovieCustomer(request())).toEqual({ok:true,userId:id,contact:{name:'Cinema Guest',email:'guest@example.test'}});
    expect(getUser).toHaveBeenCalledWith(token);
  });
  it('can use a confirmed phone instead of an unconfirmed email', async () => {
    reply({...profile,user_metadata:{first_name:' Cinema ',last_name:' Guest '},phone_confirmed_at:'2026-01-01'});
    expect(await resolveNativeMovieCustomer(request())).toEqual({ok:true,userId:id,contact:{name:'Cinema Guest',phone:'254712000000'}});
  });
  it('rejects anonymous, unconfirmed and missing-profile users', async () => {
    reply({...profile,is_anonymous:true});
    expect(await resolveNativeMovieCustomer(request())).toEqual({ok:false,reason:'sign_in'});
    reply(profile);
    expect(await resolveNativeMovieCustomer(request())).toEqual({ok:false,reason:'profile_required'});
    reply({...profile,user_metadata:{},email_confirmed_at:'2026-01-01'});
    expect(await resolveNativeMovieCustomer(request())).toEqual({ok:false,reason:'profile_required'});
  });
  it('distinguishes rejected credentials from an unavailable Auth service', async () => {
    getUser.mockResolvedValue({data:{user:null},error:{status:401}});
    expect(await resolveNativeMovieCustomer(request())).toEqual({ok:false,reason:'sign_in'});
    getUser.mockRejectedValue(new Error('upstream offline'));
    expect(await resolveNativeMovieCustomer(request())).toEqual({ok:false,reason:'unavailable'});
  });
});
