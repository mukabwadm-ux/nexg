/** Booking gathers its own visit/trip details rather than a shopping delivery location. */
export function isBookingPage(pathname: string) {
  return (
    pathname === '/booking-workspace' ||
    pathname === '/merchant/calendar' ||
    pathname.startsWith('/book/')
  );
}
