export const WHATSAPP_NUMBER = '254143819478';
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

/** The floating contact button: a link into the NexG WhatsApp chat. */
export function WhatsAppButton() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#128C7E] focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 2C6.5 2 2 6.5 2 12.04c0 1.77.46 3.5 1.34 5.02L2 22l5.07-1.33a10 10 0 0 0 4.97 1.27C17.58 21.94 22 17.5 22 11.96 22 6.46 17.55 2 12.04 2zm0 18.2c-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3.01.79.8-2.93-.2-.31a8.2 8.2 0 0 1-1.26-4.37c0-4.55 3.7-8.25 8.26-8.25a8.2 8.2 0 0 1 8.25 8.24c0 4.55-3.7 8.17-8.29 8.17z" />
      </svg>
    </a>
  );
}
