# Commercial use inside paid NEXG portals

Checked: 31 October 2026. This records the published license terms for the selected open-source components, not a blanket license for every possible add-on or hosted service.

## Intended business model

NEXG hosts and provides merchant portals that include booking/calendar functionality built with Payload CMS core, Payload Reserve and NEXG additions. Merchants may pay NEXG for subscriptions, functionality or services. Both inspected components use MIT, which permits commercial use, modification, distribution, sublicensing and sale of copies, subject to retaining the required notices.

Sources: [Payload CMS 3.86.0 LICENSE.md](https://github.com/payloadcms/payload/blob/v3.86.0/LICENSE.md), [Payload Reserve inspected commit LICENSE](https://github.com/elghaied/payload-reserve/blob/fd937bdb6222ff469687b6c91bf88e4f262c6f0a/LICENSE). [Payload CMS current main license](https://github.com/payloadcms/payload/blob/main/LICENSE.md) also states MIT when checked.

## What these licenses permit

- Use the components in a paid portal under NEXG's product branding.
- Modify the software to fit NEXG's merchant workflows and calendar needs.
- Charge merchants without a per-merchant software license fee, revenue share or royalty required by these MIT licenses.
- Keep NEXG's proprietary code and modifications private; MIT imposes no copyleft source-publication requirement.

## Obligations and limits

- Retain each component's copyright and full MIT license text, including the warranty disclaimer, in copies or substantial portions of that software. Preserve source notices and relevant distribution/bundle notices. A maintained third-party notices file should accompany deployed/distributed software containing it; frontend bundle/build processing must preserve the applicable notices as well.
- MIT does not require a visible 'Powered by Payload' banner on every merchant screen. Required copyright/license notices still need to be preserved.
- MIT does not transfer ownership of the original software to NEXG or separately grant trademark rights. Use NEXG branding and do not imply the original authors endorse NEXG.
- Check the exact selected release and all shipped dependencies and separately licensed plugins, assets, templates or enterprise features. The repository's core license is not proof that every outside component or service has the same terms.
- Hosting, Google/payment/messaging services, paid support and optional enterprise products can have their own charges and agreements. Those do not create a royalty under the inspected MIT licenses.

## Implementation record

Pin the selected releases/commit, record source and license paths, preserve notices in build/deployment artifacts and track added dependencies. A future upgrade requires reviewing its actual license and dependency changes; do not assume all future products will use identical terms. NEXG's merchant pricing is its own commercial decision, subject to any separate services it deliberately buys.

The appropriate statement is that NEXG can use and modify these MIT components inside paid portals without royalties under those licenses, while fulfilling their notice requirements. 'No obligations at all' would be inaccurate.
