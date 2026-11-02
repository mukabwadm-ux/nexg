// One isolated Auth integration check. Its SMTP server captures only synthetic mail.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js');
const sourceContainer = 'supabase_auth_nexg-merchant-onboarding-run-20261102';
const databaseContainer = 'supabase_db_nexg-merchant-onboarding-run-20261102';
const name = `nexg-otp-check-${randomUUID().slice(0, 8)}`;
let userId;
let started = false;
const received = [];

function docker(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function listen(server) {
  return new Promise((resolve, reject) => server.once('error', reject).listen(0, '0.0.0.0', () => resolve(server.address().port)));
}
const templateServer = http.createServer((_, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end('<p>VALIDATIONCODE:{{ .Token }}</p>');
});
const smtpServer = net.createServer((socket) => {
  let buffer = '';
  let message = null;
  socket.write('220 local-test ESMTP\r\n');
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let end;
    while ((end = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (message !== null) {
        if (line === '.') { received.push(message); message = null; socket.write('250 queued\r\n'); }
        else message += `${line}\n`;
      } else if (/^EHLO /i.test(line)) socket.write('250-local-test\r\n250 8BITMIME\r\n');
      else if (/^HELO |^MAIL FROM:|^RCPT TO:|^RSET/i.test(line)) socket.write('250 OK\r\n');
      else if (/^DATA$/i.test(line)) { message = ''; socket.write('354 send data\r\n'); }
      else if (/^QUIT$/i.test(line)) { socket.write('221 bye\r\n'); socket.end(); }
      else socket.write('250 OK\r\n');
    }
  });
});

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}

try {
  const config = JSON.parse(docker(['inspect', sourceContainer]))[0];
  const environment = Object.fromEntries(config.Config.Env.map((entry) => {
    const index = entry.indexOf('=');
    return [entry.slice(0, index), entry.slice(index + 1)];
  }));
  // The image provides its own PATH; never replace the Windows host PATH.
  delete environment.PATH;
  const templatePort = await listen(templateServer);
  const smtpPort = await listen(smtpServer);
  const portReservation = net.createServer();
  const authPort = await listen(portReservation);
  await new Promise((resolve) => portReservation.close(resolve));
  Object.assign(environment, {
    GOTRUE_MAILER_AUTOCONFIRM: 'false',
    GOTRUE_SECURITY_MANUAL_LINKING_ENABLED: 'true',
    GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED: 'true',
    GOTRUE_MAILER_OTP_LENGTH: '6',
    GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: `http://host.docker.internal:${templatePort}/otp`,
    GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: `http://host.docker.internal:${templatePort}/otp`,
    GOTRUE_SMTP_HOST: 'host.docker.internal', GOTRUE_SMTP_PORT: String(smtpPort),
    GOTRUE_SMTP_USER: '', GOTRUE_SMTP_PASS: '', GOTRUE_SMTP_MAX_FREQUENCY: '1s',
    API_EXTERNAL_URL: `http://127.0.0.1:${authPort}`,
  });
  const args = ['run', '-d', '--rm', '--name', name, '--network', config.HostConfig.NetworkMode,
    '-p', `127.0.0.1:${authPort}:9999`];
  for (const key of Object.keys(environment)) args.push('-e', key);
  args.push(config.Config.Image, ...config.Config.Cmd);
  docker(args, { env: { ...process.env, ...environment } });
  started = true;
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${authPort}/health`, { signal: AbortSignal.timeout(1000) })).ok; }
    catch { return false; }
  }, 'The isolated Auth service did not become ready.');

  const local = fs.readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8');
  const key = local.split(/\r?\n/).find((line) => line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  assert.ok(key, 'The local public Supabase key is missing.');
  const client = createClient(`http://127.0.0.1:${authPort}`, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(String(url).replace('/auth/v1/', '/'), options) },
  });
  const start = await client.auth.signInAnonymously();
  assert.equal(start.error, null, 'Could not create the synthetic applicant.');
  userId = start.data.user?.id;
  assert.ok(userId);
  const email = `otp-${randomUUID()}@example.test`;
  const request = await client.auth.updateUser({ email });
  assert.equal(request.error, null, 'Could not request a verification code.');
  assert.equal(request.data.user?.id, userId);
  assert.equal(request.data.user?.is_anonymous, true);
  assert.equal(request.data.user?.new_email, email);
  await waitFor(() => received.length >= 1, 'No synthetic verification email arrived.');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  // A pending email change on an anonymous user has no current email for the
  // public resend endpoint to look up. Reissue it on the same user instead.
  const resend = await client.auth.updateUser({ email });
  assert.equal(resend.error, null, 'Resending the verification code failed.');
  await waitFor(() => received.length >= 2, 'No synthetic resend arrived.');
  const code = received[1].match(/VALIDATIONCODE:(\d{6})/)?.[1];
  assert.ok(code, 'The verification email did not contain a six-digit code.');
  const verified = await client.auth.verifyOtp({ type: 'email_change', email, token: code });
  assert.equal(verified.error, null, 'The verification code was rejected.');
  assert.equal(verified.data.user?.id, userId);
  assert.equal(verified.data.user?.is_anonymous, false);
  assert.ok(verified.data.user?.email_confirmed_at);
  const refreshed = await client.auth.refreshSession();
  assert.equal(refreshed.data.user?.id, userId);
  assert.equal(refreshed.data.user?.is_anonymous, false);
  const claims = JSON.parse(Buffer.from(refreshed.data.session.access_token.split('.')[1], 'base64url').toString());
  assert.equal(claims.sub, userId);
  assert.equal(claims.is_anonymous, false, 'The refreshed token still identifies the owner as anonymous.');
  await client.auth.signOut();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const signIn = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  assert.equal(signIn.error, null, 'Could not request the returning sign-in code.');
  await waitFor(() => received.length >= 3, 'No synthetic sign-in email arrived.');
  const signInCode = received[2].match(/VALIDATIONCODE:(\d{6})/)?.[1];
  assert.ok(signInCode, 'The sign-in email did not contain a six-digit code.');
  const signedIn = await client.auth.verifyOtp({ type: 'email', email, token: signInCode });
  assert.equal(signedIn.error, null, 'The sign-in code was rejected.');
  assert.equal(signedIn.data.user?.id, userId);
  console.log('Isolated Auth check passed: request, resend, verification, same account and later email sign-in. No real email was sent.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The isolated Auth check failed.');
  process.exitCode = 1;
} finally {
  if (started) try { docker(['rm', '-f', name]); } catch { console.error('Could not remove the isolated test Auth container.'); process.exitCode = 1; }
  if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    try { docker(['exec', databaseContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', `delete from auth.users where id = '${userId}'::uuid`]); }
    catch { console.error('Could not remove the synthetic test account.'); process.exitCode = 1; }
  }
  templateServer.close();
  smtpServer.close();
}
