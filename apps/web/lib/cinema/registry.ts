import { CinemaError, type CinemaConnector } from './connector';
import { SandboxCinemaConnector } from './sandbox-connector';
import type { ConnectorFor, Rpc } from './service';

/**
 * Which class speaks to a connection's ticketing system, by the adapter it
 * was connected with (public.connector_adapter, vertical 'cinemas'). A real
 * cinema's system is one more case here.
 */
export function connectorRegistry(db: Rpc): ConnectorFor {
  return ({ connectionId, adapterId }): CinemaConnector => {
    switch (adapterId) {
      case 'sandbox-cinema':
        // The sandbox keeps each connection's cinema apart by its id, and
        // answers only for connections made with the sandbox adapter.
        return new SandboxCinemaConnector((op, args) =>
          db('sandbox_cinema', { p_tenant: connectionId, p_op: op, p_args: args }),
        );
      default:
        return unknownSystem(adapterId);
    }
  };
}

/* A connection whose adapter this build does not know answers like a
   system that is down, so nothing is sold against it. */
function unknownSystem(adapterId: string): CinemaConnector {
  const down = async (): Promise<never> => {
    throw new CinemaError('unavailable', `No connector for ${adapterId}.`);
  };
  return {
    adapterId,
    capabilities: { extend: false, cancel: false, maxSeats: 0, maxHoldSeconds: 0 },
    programme: down,
    seatMap: down,
    hold: down,
    extend: down,
    confirm: down,
    lookup: down,
    release: down,
    cancel: down,
  };
}
