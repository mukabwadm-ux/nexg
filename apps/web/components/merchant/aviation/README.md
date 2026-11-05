# Heliflight meeting demo

Heliflight Africa uses the merchant portal's shared Home overview, Work queue and record panel, Offerings catalogue and editor, and Availability timeline and agenda. The flight records supply the quote, aircraft, confirmation and payment details in those views.

## Open the demo

Open [Heliflight demo](http://127.0.0.1:3000/merchant-live-preview/heliflight) on the local portal. For a separate meeting server, start the web app from the workspace root:

```powershell
$env:NEXG_NEXT_DIST_DIR = '.next-heliflight-demo'
pnpm --filter @nexg/web exec next dev --turbo --hostname 127.0.0.1 --port 3142
```

The preview routes are development-only.

To enter through [merchant registration](http://127.0.0.1:3000/merchants/register), select **Flights & aviation** under **Meeting demos**, choose one or more specialties, and select **Open Heliflight demo**. The specialties are Helicopter charters, Scenic flights, Safari flights and Private charters. This opens the Heliflight sample identity.

## Three-minute meeting walkthrough

1. **0:00 to 0:30.** Open Home. Show the shared navigation, charter pipeline and next confirmed flight. Explain that these are sample records for 5 November 2026 in East Africa Time.
2. **0:30 to 1:30.** Open Work, then New quote. Enter a sample customer and route. Choose an aircraft, passenger count and departure. Enter occupied and positioning minutes, review the hourly minimum and itemised fees, then select Prepare quote. Routes do not calculate flying time automatically.
3. **1:30 to 2:10.** In Flight bookings, open the prepared quote. Record sample customer acceptance and written operator confirmation, then confirm the sample booking. Passenger checklist completion and payment recording are separate actions. The sample schedule checks aircraft overlap before confirmation.
4. **2:10 to 2:40.** Open Availability. Show the aircraft timeline, existing option and maintenance period. Add or remove a sample hold or maintenance block. Scheduling is bounded to 07:00 to 19:00 EAT. Changing a held booking's aircraft or departure releases its previous option for review.
5. **2:40 to 3:00.** Open Money to show payment state separately from booking confirmation. Finish in Offerings to review the four flight services. Ask which staff should prepare quotes, assign aircraft and record operator confirmation.

## Scope and sample boundaries

Work supports local quote drafts, customer acceptance, aircraft options, operator confirmation, sample payments, checklist completion, cancellation and completion. Availability shares these local flight records and blocks. Other sections provide the corresponding meeting views within the existing navigation.

Changes persist in this browser under `nexg:heliflight-meeting-demo:v1`. Settings offers **Reset sample records**, followed by **Reset demo**. Exiting the demo returns to onboarding; it does not erase the sample flight records.

The demo sends no customer messages, creates no live bookings, collects no money and issues no invoice or refund. USD amounts are illustrative quote inputs. They do not change the platform's production KES configuration. Aircraft seats, sample time blocks and operator-confirmation controls do not calculate payload, approve a landing site, verify crew qualifications or authorize a flight. Real integrations and operational rules remain follow-up work with Heliflight.

## Integration

`lib/aviation-demo.ts` defines the isolated demo category and identity. Registration keeps its choice separate from saved application data. The shared `MerchantLivePreviewShell` selects `AviationWorkspace` for this category; preview routes with their own specialty sources use `AviationDemoPage` to avoid activating another category's data. `model.ts` and `use-demo-state.ts` own the local sample records. Existing production taxonomy, database category publication and booking-engine contracts remain unchanged.

