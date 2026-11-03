/* Local design renderer. Never sends email or changes the application. */
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");
const root = __dirname;
const esc = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  lock: '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3M12 14v2"/>',
  key: '<circle cx="8" cy="9" r="4"/><path d="m11 12 8 8m-3-3 2-2m-5-1 2-2"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  store:
    '<path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0M9 20v-6h6v6"/>',
  alert: '<path d="m12 3 10 17H2L12 3ZM12 9v5M12 17h.01"/>',
  bag: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18m-13 4 2 2 5-3"/>',
  message:
    '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-6a8 8 0 0 1-1-5 9 9 0 0 1 19 0ZM7 10h10M7 14h6"/>',
  wallet:
    '<path d="M20 8V5H5a3 3 0 0 0 0 6h16v9H5a3 3 0 0 1-3-3V8M21 11h-6v5h6M17 13.5h.01"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 5a3 3 0 0 1 0 6m2 4a6 6 0 0 1 4 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/>',
};
const svg = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.mail}</svg>`;

const otpCopyScript = `<script>
(function () {
  function fallbackCopy(value) {
    const field = document.createElement('textarea');
    field.value = value;
    field.readOnly = true;
    field.setAttribute('aria-hidden', 'true');
    field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    const previousFocus = document.activeElement;
    document.body.appendChild(field);
    let copied = false;
    try {
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, value.length);
      copied = document.execCommand('copy') === true;
    } catch (error) {
      copied = false;
    } finally {
      field.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    }
    return copied;
  }
  async function copyValue(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (error) {
        // A blocked Clipboard API may still allow user-initiated legacy copying.
      }
    }
    return fallbackCopy(value);
  }
  document.addEventListener('click', async function (event) {
    const button = event.target.closest('[data-copy-code]');
    if (!button || button.disabled) return;
    const value = button.dataset.copyCode;
    if (!/^[0-9]{6}$/.test(value)) return;
    const label = button.querySelector('[data-copy-label]');
    const status = document.getElementById(button.getAttribute('aria-describedby'));
    button.disabled = true;
    status.textContent = '';
    const copied = await copyValue(value);
    button.disabled = false;
    label.textContent = copied ? 'Copied' : 'Copy code';
    status.textContent = copied ? 'Code copied to clipboard.' : 'Copy failed. Select and copy this code: ' + value + '.';
  });
})();
</script>`;

function emailHtml(e, css) {
  const otpValue = e.code ? String(e.code).replace(/\s/g, "") : "";
  if (e.code && !/^\d{6}$/.test(otpValue))
    throw new Error("OTP preview requires exactly six digits.");
  const code = otpValue
    ? `<div class="otp-panel"><div class="code-label">${esc(e.codeLabel || "Your one-time verification code")}</div><div class="digits" aria-label="${esc(otpValue)}">${[...otpValue].map((d) => `<span class="digit">${esc(d)}</span>`).join("")}</div><div class="otp-actions"><button class="copy-code" type="button" data-copy-code="${esc(otpValue)}" aria-describedby="copy-code-status"><span aria-hidden="true">${svg("copy")}</span><span data-copy-label>Copy code</span></button><p class="copy-status" id="copy-code-status" role="status" aria-live="polite" aria-atomic="true"></p></div><div class="expiry">${svg("clock")}${esc(e.expiry)}</div></div>`
    : "";
  const amount = e.amount
    ? `<div class="amount-block"><div class="amount-label">${esc(e.amountLabel)}</div><div class="amount">${esc(e.amount)}</div></div>`
    : "";
  const rows = e.rows?.length
    ? `<dl class="rows">${e.rows.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`
    : "";
  const steps = e.steps?.length
    ? `<ol class="steps">${e.steps.map((v, i) => `<li><span class="step-number">${i + 1}</span><span>${esc(v)}</span></li>`).join("")}</ol>`
    : "";
  const button = e.cta
    ? `<a class="cta" aria-disabled="true" tabindex="-1">${esc(e.cta)}${svg("arrow")}</a>${e.ctaNote ? `<p class="cta-note">${esc(e.ctaNote)}</p>` : ""}`
    : e.ctaNote
      ? `<p class="cta-note">${esc(e.ctaNote)}</p>`
      : "";
  const callout = e.callout
    ? `<div class="callout ${e.callout.tone === "warning" ? "warning" : ""}">${svg(e.callout.tone === "warning" ? "shield" : "help")}<div><p class="callout-title">${esc(e.callout.title)}</p><p class="callout-body">${esc(e.callout.body)}</p></div></div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(e.name)} | NEXG email preview</title><meta name="description" content="${esc(e.preheader)}"><style>${css}</style></head><body><main class="stage tone-${e.tone}"><div class="preview-label"><span>NEXG / MERCHANT EMAIL</span><span>${esc(e.group.toUpperCase())}</span></div><article class="envelope" aria-label="${esc(e.name)} email mockup"><div class="brand-header"><img class="wordmark" src="../assets/nexg-wordmark.png" alt="NEXG"><div class="merchant-label">MERCHANT</div></div><div class="content"><div class="status"><span class="status-icon">${svg(e.icon)}</span><span class="eyebrow">${esc(e.eyebrow)}</span></div><h1>${esc(e.title)}</h1><p class="greeting">${esc(e.greeting || "Hi Amina,")}</p><p class="intro">${esc(e.intro)}</p>${code}${amount}${rows}${steps}${button}${callout}${e.closing ? `<p class="closing">${esc(e.closing)}</p>` : ""}<div class="signoff">Here to help,<br><strong>The NexG team</strong></div></div><footer class="email-footer"><div class="footer-help">Need a hand?<br><strong>info@nexgapp.com</strong></div><div class="footer-name">NexG Merchant<span>nexgapp.com</span></div></footer></article><p class="preview-note"><strong>Design preview · Sample data</strong><br>${e.code ? "Example code only. OTP expiry requirement: 30 minutes." : "Layout and copy for review. Actions are inactive."}</p></main>${otpValue ? otpCopyScript : ""}</body></html>`;
}

const galleryCss = `@font-face{font-family:Manrope;src:url('./assets/manrope-latin.woff2');font-weight:400 800}*{box-sizing:border-box}body{margin:0;background:#f6f3ec;color:#141414;font-family:Manrope,Arial,sans-serif}header{background:#191815;color:#fff;padding:44px max(30px,calc((100vw - 1440px)/2)) 38px;border-bottom:3px solid #d4a72c}.kicker{font-size:10px;letter-spacing:2.5px;color:#d5bb75;font-weight:700}h1{font-size:36px;letter-spacing:-1.2px;margin:14px 0 12px}header p{max-width:800px;line-height:1.9;font-size:13px;color:#c5bfb2}.chips{display:flex;gap:9px;flex-wrap:wrap;margin-top:23px}.chips span{border:1px solid #494436;border-radius:5px;padding:8px 12px;color:#e5d9b9;font-size:10px}main{max-width:1500px;padding:32px 30px 50px;margin:auto}nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:30px}nav button{font:600 11px Manrope,Arial;cursor:pointer;border:1px solid #ddd5c4;background:#fff;border-radius:6px;padding:10px 13px;color:#625c4e}nav button[aria-pressed=true]{background:#28251e;color:white;border-color:#28251e}button:focus-visible,a:focus-visible{outline:3px solid #8a6a10;outline-offset:4px}section{margin-bottom:38px}h2{font-size:19px;letter-spacing:-.3px;margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}.tile{color:inherit;text-decoration:none;display:block;border:1px solid #e0d9cb;border-radius:9px;overflow:hidden;background:#fff;transition:box-shadow .2s}.tile:hover{box-shadow:0 5px 20px #29231314}.thumb{background:#ece7dc;height:250px;overflow:hidden;border-bottom:1px solid #e7e0d3}.thumb img{width:100%;display:block}.tile-info{padding:17px 17px 18px}.tile-info small{font-size:9px;font-weight:750;color:#98751f;letter-spacing:1px}.tile-info h3{font-size:13px;margin:7px 0 9px;line-height:1.5}.tile-info p{font-size:10px;line-height:1.8;color:#7c7262;margin:0}.review-note{padding:18px 22px;background:#eee8d9;border:1px solid #e1d6bd;border-radius:8px;color:#625744;line-height:1.9;font-size:11px;margin-top:35px}.foot{font-size:10px;color:#8c806b;margin-top:18px}a{color:#78580a}@media(max-width:1000px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:720px){header{padding:30px 22px}h1{font-size:29px}main{padding:25px 20px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.thumb{height:215px}}@media(max-width:420px){.grid{grid-template-columns:1fr}.thumb{height:370px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}`;

function galleryHtml(emails) {
  const groups = [...new Set(emails.map((e) => e.group))];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXG merchant email designs</title><style>${galleryCss}</style></head><body><header><div class="kicker">NEXG / MERCHANT COMMUNICATIONS</div><h1>The merchant email collection</h1><p>Consistent emails for verification, business setup, daily work and money. Open any design to review its complete layout and copy.</p><div class="chips"><span>${emails.length} email designs</span><span>30-minute OTP expiry</span><span>Desktop + mobile PNGs</span><span>Design previews · Sample data</span></div></header><main><nav aria-label="Filter email category"><button type="button" data-filter="all" aria-pressed="true">All emails</button>${groups.map((g) => `<button type="button" data-filter="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join("")}</nav>${groups
    .map(
      (g) =>
        `<section data-group="${esc(g)}"><h2>${esc(g)}</h2><div class="grid">${emails
          .filter((e) => e.group === g)
          .map(
            (e) =>
              `<a class="tile" href="./emails/${e.id}.html"><div class="thumb"><img src="./thumbnails/${e.id}.png" alt="${esc(e.name)} email preview" loading="lazy"></div><div class="tile-info"><small>${e.id.slice(0, 2)} / ${esc(e.eyebrow)}</small><h3>${esc(e.name)}</h3><p>${esc(e.subject)}</p></div></a>`,
          )
          .join("")}</div></section>`,
    )
    .join(
      "",
    )}<div class="review-note">These are proposed email designs. All codes, amounts, references, businesses and personal details are fictional. Delivery, triggers, recipient permissions and preferences need implementation review. The sample sender uses the repository's support fallback address; production sender routing must be confirmed. OTP expiry is the requested 30 minutes; the existing local one-hour setting has not been changed. OTP copy buttons work in these browser previews. Navigation actions are inactive.</div><p class="foot"><a href="./README.md">Design handoff and coverage</a> · <a href="./catalogue.json">Email copy and event catalogue</a> · Created 1 November 2026</p></main><script>document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('[data-group]').forEach(s=>s.hidden=button.dataset.filter!=='all'&&s.dataset.group!==button.dataset.filter)}));</script></body></html>`;
}

function boardHtml(emails, title, subtitle) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>@font-face{font-family:Manrope;src:url('./assets/manrope-latin.woff2');font-weight:400 800}*{box-sizing:border-box}body{margin:0;background:#eee9de;color:#1a1812;font-family:Manrope,Arial}.board{padding:46px 48px 32px}.heading{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:25px;border-bottom:1px solid #d4cbb7;margin-bottom:27px}.eyebrow{font-size:10px;font-weight:750;letter-spacing:2px;color:#80621b}h1{font-size:33px;font-weight:750;letter-spacing:-1px;margin:9px 0 8px}p{font-size:12px;color:#766a54;margin:0}.count{font-size:10px;color:#766a54;padding:9px 12px;border:1px solid #d0c4ab;border-radius:5px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:23px 24px}.item h2{font-size:12px;margin:0 0 11px;font-weight:700}.item h2 span{color:#9c7821;font-size:10px;margin-right:7px}.shot{width:100%;height:590px;overflow:hidden;border:1px solid #d8cebb;border-radius:8px;background:#f6f3ec}.shot img{width:100%;height:100%;object-fit:contain;object-position:top;display:block}.foot{font-size:9px;letter-spacing:.25px;color:#8c7d64;margin-top:23px;display:flex;justify-content:space-between}</style></head><body><main class="board"><header class="heading"><div><div class="eyebrow">NEXG / MERCHANT COMMUNICATIONS</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="count">DESIGN PREVIEWS / SAMPLE DATA</div></header><div class="grid">${emails.map((e) => `<article class="item"><h2><span>${e.id.slice(0, 2)}</span>${esc(e.name)}</h2><div class="shot"><img src="./images/${e.id}.png" alt="${esc(e.name)}"></div></article>`).join("")}</div><footer class="foot"><span>NEXG · Merchant email design system</span><span>1 November 2026 · OTP expiry: 30 minutes</span></footer></main></body></html>`;
}

async function dimensions(page) {
  return page.evaluate(() => ({
    width: innerWidth,
    height: document.documentElement.scrollHeight,
    documentWidth: document.documentElement.scrollWidth,
    fits: document.documentElement.scrollWidth <= innerWidth,
    assetsLoaded: [...document.images].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
    fontLoaded: document.fonts.check("600 14px Manrope"),
    textFits: [
      ...document.querySelectorAll("h1,.intro,.digit,.expiry,.cta,.row dd"),
    ].every((e) => e.scrollWidth <= e.clientWidth + 1),
  }));
}

async function writeThumbnail(page, input, output) {
  const png = await fs.readFile(input);
  const base64 = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = "data:image/png;base64," + data;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 380;
    canvas.height = Math.round(
      (image.naturalHeight * 380) / image.naturalWidth,
    );
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  }, png.toString("base64"));
  await fs.writeFile(output, Buffer.from(base64, "base64"));
}

async function main() {
  const emails = JSON.parse(
    await fs.readFile(path.join(root, "catalogue.json"), "utf8"),
  );
  const selectionArg = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--only="));
  const selectedIds = selectionArg
    ? new Set(selectionArg.slice(7).split(",").filter(Boolean))
    : null;
  if (
    selectedIds &&
    (!selectedIds.size ||
      [...selectedIds].some((id) => !emails.some((email) => email.id === id)))
  ) {
    throw new Error("--only must list valid email IDs separated by commas.");
  }
  const captureEmails = selectedIds
    ? emails.filter((email) => selectedIds.has(email.id))
    : emails;
  let preservedResults = [];
  if (selectedIds) {
    let previous;
    try {
      previous = JSON.parse(
        await fs.readFile(path.join(root, "verification.json"), "utf8"),
      );
    } catch {
      throw new Error(
        "A targeted render requires a previous complete verification report.",
      );
    }
    preservedResults = emails
      .filter((email) => !selectedIds.has(email.id))
      .map((email) => {
        const result = previous.results?.find(
          (result) => result.id === email.id,
        );
        if (!result)
          throw new Error(
            "Missing prior verification for " +
              email.id +
              ". Run a full render first.",
          );
        return result;
      });
  }
  const css = await fs.readFile(path.join(root, "email.css"), "utf8");
  for (const folder of ["emails", "images", "mobile", "boards", "thumbnails"])
    await fs.mkdir(path.join(root, folder), { recursive: true });
  for (const e of emails)
    await fs.writeFile(
      path.join(root, "emails", e.id + ".html"),
      emailHtml(e, css),
    );
  await fs.writeFile(path.join(root, "index.html"), galleryHtml(emails));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 760, height: 1000 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const results = [...preservedResults],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    for (const e of captureEmails) {
      await page.setViewportSize({ width: 760, height: 1000 });
      await page.goto(
        pathToFileURL(path.join(root, "emails", e.id + ".html")).href,
      );
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator("img")
        .evaluateAll((images) => Promise.all(images.map((i) => i.decode())));
      await page.screenshot({
        path: path.join(root, "images", e.id + ".png"),
        fullPage: true,
      });
      await writeThumbnail(
        page,
        path.join(root, "images", e.id + ".png"),
        path.join(root, "thumbnails", e.id + ".png"),
      );
      const desktop = await dimensions(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(root, "mobile", e.id + ".png"),
        fullPage: true,
      });
      results.push({ id: e.id, desktop, mobile: await dimensions(page) });
    }
    const groups = [...new Set(emails.map((e) => e.group))];
    const boards = [
      {
        id: "00-overview",
        title: "Merchant emails, in one consistent style.",
        subtitle: "Verification, onboarding, work, money and account care.",
        items: [0, 1, 9, 12, 13, 17].map((i) => emails[i]),
      },
      ...groups.map((g, i) => ({
        id:
          String(i + 1).padStart(2, "0") +
          "-" +
          g
            .toLowerCase()
            .replace(/[^a-z]+/g, "-")
            .replace(/-$/, ""),
        title: g,
        subtitle: "NEXG merchant email collection",
        items: emails.filter((e) => e.group === g),
      })),
    ];
    for (const board of boards) {
      const target = path.join(root, board.id + ".html");
      await fs.writeFile(
        target,
        boardHtml(board.items, board.title, board.subtitle),
      );
      await page.setViewportSize({ width: 1680, height: 1000 });
      await page.goto(pathToFileURL(target).href);
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator("img")
        .evaluateAll((images) => Promise.all(images.map((i) => i.decode())));
      await page.screenshot({
        path: path.join(root, "boards", board.id + ".png"),
        fullPage: true,
        scale: "css",
      });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pathToFileURL(path.join(root, "index.html")).href);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("img").evaluateAll((images) =>
      Promise.all(
        images.map((image) => {
          image.loading = "eager";
          return image.decode();
        }),
      ),
    );
    const galleryDesktop = await dimensions(page);
    await page.getByRole("button", { name: "Money", exact: true }).click();
    const filterWorks =
      (await page.locator("section:visible").count()) === 1 &&
      (await page.locator("section:visible h2").textContent()) === "Money";
    await page.getByRole("button", { name: "All emails", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const galleryMobile = await dimensions(page);
    const report = {
      scope:
        "Local visual mockups only. No sending, event integration or inbox-client compatibility certification.",
      rendering:
        "HTML/CSS rendered in local Chromium, not AI image generation.",
      otpRequirement: {
        digits: 6,
        expiryMinutes: 30,
        source: "User instruction",
        existingLocalConfigSeconds: 3600,
        configurationChanged: false,
      },
      count: emails.length,
      results: emails.map((email) =>
        results.find((result) => result.id === email.id),
      ),
      capturedIds: captureEmails.map((email) => email.id),
      gallery: { desktop: galleryDesktop, mobile: galleryMobile, filterWorks },
      runtimeErrors: errors,
      status:
        results.length === emails.length &&
        results.every(
          (r) =>
            r.desktop.fits &&
            r.mobile.fits &&
            r.desktop.assetsLoaded &&
            r.mobile.assetsLoaded &&
            r.desktop.fontLoaded &&
            r.mobile.fontLoaded &&
            r.desktop.textFits &&
            r.mobile.textFits,
        ) &&
        galleryDesktop.fits &&
        galleryMobile.fits &&
        filterWorks &&
        !errors.length
          ? "passed"
          : "failed",
    };
    await fs.writeFile(
      path.join(root, "verification.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    process.stdout.write(
      JSON.stringify({
        status: report.status,
        count: emails.length,
        desktopPNGs: captureEmails.length,
        mobilePNGs: captureEmails.length,
        boards: boards.length,
        runtimeErrors: errors,
      }) + "\n",
    );
    if (report.status !== "passed") process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
});
