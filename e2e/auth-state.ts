/*
 * Where the signed-in admin session is cached.
 *
 * Its own module on purpose: the config needs the path and so
 * does the setup spec, and importing the spec into the config
 * runs `setup()` at config-load time, which Playwright rejects
 * outright ("did not expect test() to be called here").
 */
export const ADMIN_STATE = 'e2e/.auth/admin.json';
