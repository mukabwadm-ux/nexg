import {BookingError} from './types.js';

/** There is intentionally no production enable switch in this candidate.
 * A future cutover must first fence the existing per-room reservation writer. */
export function assertStayPilotEnabled(inventory:Record<string,unknown>,environment=process.env.NODE_ENV):void {
 if(environment!=='test'||inventory.pilotState!=='synthetic_fixture_enabled')
  throw new BookingError(503,'Native Stay room pilot is disabled pending reviewed single-writer cutover.','stay_pilot_disabled');
}
