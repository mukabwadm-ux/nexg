---
name: NEXG merchant Offerings
description: Scoped record of the implemented adaptive catalogue and editor in the existing merchant workspace.
colors:
  workspace: '#f6f3ec'
  surface: '#ffffff'
  shell: '#141414'
  ink: '#171b24'
  muted: '#586071'
  line: '#e3e1dc'
  field-line: '#cdd0d7'
  gold: '#d4a72c'
  gold-text: '#775617'
  gold-hover: '#c89a22'
  selected: '#fcf6e9'
  status-surface: '#f0f1f4'
  draft: '#969ca8'
  published: '#278047'
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: '39px'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '-0.035em'
  title:
    fontFamily: 'Manrope, system-ui, sans-serif'
    fontSize: '19px'
    fontWeight: 750
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  body:
    fontFamily: 'Manrope, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Manrope, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 600
  table:
    fontFamily: 'Manrope, system-ui, sans-serif'
    fontSize: '12px'
  status:
    fontFamily: 'Manrope, system-ui, sans-serif'
    fontSize: '11px'
rounded:
  thumbnail: '4px'
  control: '5px'
  table: '8px'
  editor: '9px'
  dialog: '10px'
  status: '14px'
spacing:
  control-block: '7px'
  control-inline: '12px'
  field-gap: '13px'
  editor-inline: '17px'
  column-gap: '22px'
  workspace-inline: '24px'
components:
  button-primary:
    backgroundColor: '{colors.gold}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '7px 12px'
  button-primary-hover:
    backgroundColor: '{colors.gold-hover}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '7px 12px'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '7px 10px'
  editor-tabs:
    textColor: '{colors.ink}'
    padding: '12px 8px 10px'
  publication-pill:
    backgroundColor: '{colors.status-surface}'
    typography: '{typography.status}'
    rounded: '{rounded.status}'
    padding: '2px 7px'
  selected-row:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.ink}'
  editor:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.editor}'
  availability-summary:
    rounded: '{rounded.control}'
    padding: '11px'
---

# Design System: NEXG merchant Offerings

## Overview

This file records Offerings as an ordinary extension of the existing NEXG merchant workspace. It is scoped to this folder and does not replace global product or design guidance. The approved [general concept](../../../../../docs/merchant-portal-plan/offerings-concept/offerings-general.png) fixes the catalogue/editor composition. The implementation retains the dark shell, cream workspace, white editor and gold actions.

The merchant scans a catalogue, selects an offering and edits the applicable contract. One composition adapts to 128 specialty bindings and 18 editor contracts. Compact controls and internal scrolling keep long records usable without reducing the whole form to one static view.

**Key Characteristics:**

- A larger catalogue column beside a selected editor.
- A serif page title above compact Manrope controls and table text.
- Fine rules, explicit selection and visible editor actions.
- Text that distinguishes publication, source ownership and preview state.

## Colors

### Primary

Gold marks primary actions and active tab underlines. Gold text uses the darker scoped value for links and disclosures. Selection uses a pale gold fill and a thin gold outline.

### Neutral

Cream separates the workspace from white tables and forms. The inherited shell uses the shared dark token; Offerings uses its own ink, muted text and fine-rule values. These scoped overrides are recorded as built rather than promoted to global tokens.

### Status

Draft and Published combine labelled dots with text. The editor adds a quiet pill background. Source warnings and errors also retain written explanations; a colour or publication dot alone never communicates current capacity.

## Typography

Manrope comes from the existing app font setup. Georgia is the Offerings page heading and customer-preview heading. The page heading reduces to 34px below 1280px, then 31px below 600px. A short desktop viewport also uses 31px. The editor title reduces to 18px on phones.

The implemented density uses a 13px body, 12px fields/table text, 11px tabs or status labels, and 10px catalogue metadata. Phone editor inputs use 16px text; toolbar inputs remain 12px. The CSS requests intermediate weights such as 750, while the app loads Manrope weights 400, 600, 700 and 800. Preserve this observation without changing the global font setup.

## Layout

The inherited shell bounds Offerings to the dynamic viewport. Desktop navigation is 160px wide, rising to 184px at the shared extra-large breakpoint. Below 1024px it becomes a horizontally scrolling top navigation strip. The white workspace header can wrap on phones.

The workspace is a column with hidden outer overflow and padding of 22px 24px 20px. Its main grid is `minmax(0, 1fr) minmax(350px, 38%)`, with a 22px gap. Below 1280px, padding becomes 17px 18px, the gap is 16px and the editor track is `minmax(340px, 40%)`. Search takes a full toolbar row at that breakpoint.

Below 1024px, only the catalogue or selected editor is visible, with **Back to catalogue** above the editor. Below 600px, workspace padding is 13px 12px 10px and heading actions fill a second row. Paired fields remain paired. Catalogue columns remain readable through internal horizontal scrolling rather than compressed text.

The catalogue table and editor body scroll independently. The table has sticky headers and a minimum width of 590px, or 630px below 1024px. Its Offering column has a 190px minimum and names wrap. The editor heading, five tabs and action footer do not shrink; only its body scrolls. Phone footer actions remain visible, and the icon-only Preview action retains its accessible name. Short desktop viewports use 8px workspace block padding, tighter catalogue-only gaps, 5px table-header block padding and 2px cell block padding. Standard rows are 37px high, fitting 10 complete rows at the tested 1280 × 633 CSS-pixel viewport. Taller desktop rows use 4px cell block padding and measure about 41px.

## Elevation & Depth

The resting catalogue and editor use borders and contrasting fills without drop shadows. Selection uses inset gold rules, not elevation. Dialogs alone use a dim overlay and the modal shadow recorded in the sidecar. Scoped focus uses a visible 2px ochre outline with a 3px offset. No Offerings animation or transition duration is introduced.

## Shapes

Controls have small rounded corners, while the table and editor have slightly larger corners. Thumbnails are compact 32px squares. Status dots are circular; the editor publication label is a pill. Borders and tab underlines provide structure without decorative accent cards.

## Components

- Buttons use dark text on gold for the primary action, white with a neutral border for secondary actions, and a 36px minimum height. The footer uses smaller button text and padding. Hover changes fill/border; disabled controls lower opacity. Links remain underlined.
- Inputs use white fill and a fine neutral border. Disabled fields use a grey fill, and invalid fields use a red border. Labels and written errors stay attached to their meaning.
- Type filters use pressed state. The editor uses Details, Pricing, Availability, Preview and History tabs with a 3px gold active underline, horizontal overflow and keyboard navigation.
- Catalogue rows combine name, type, price basis, publication, capacity/stock and source. A selected row receives a pale fill and inset outline. Publication remains separate from zero stock, unknown stock, unlinked setup and stale/offline/pending sources.
- Source ownership is explicit for details, price and availability. Externally owned fields are read-only. The source dialog says it is a frontend simulation. The shell says **Sample preview**, catalogue/footer notices say **Saved in this browser only**, and save/publication messages retain that local scope. Customer preview says transactions are not enabled.
- Repeated service thumbnails are existing project demo category imagery. Product rows can use the existing box placeholder. Provenance remains in [category image credits](../../../public/images/categories/CREDITS.md). Real listing media uses the upload and alternative-text fields.

The approved concept and the [desktop](../../../../../docs/merchant-portal-plan/offerings-concept/implementation/desktop.png), [compact](../../../../../docs/merchant-portal-plan/offerings-concept/implementation/compact.png) and [phone](../../../../../docs/merchant-portal-plan/offerings-concept/implementation/mobile.png) captures are planning and verification evidence. This implementation generated no new shipping raster.

## Do's and Don'ts

### Do:

- Do preserve the existing merchant shell and the catalogue/editor relationship.
- Do keep long content reachable through internal scrolling, tabs and disclosures.
- Do keep preview scope, source ownership and current capacity explicit in text.

### Don't:

- Don't turn this scoped record into a replacement global visual identity.
- Don't equate Published with available stock or confirmed resource readiness.
- Don't treat reused demo imagery or browser captures as real merchant listing evidence.

## Added interaction behavior

The selected editor provides Add offering and Add discount shortcuts. Closing it removes the reserved detail column and expands the catalogue and its controls to available width; selecting a row restores the shared split composition. Discount controls remain in Pricing with percentage/fixed KES choices, optional Nairobi-time dates, an original-price line and Publish changes for a modified published listing. Quantity/options and organization/bundle settings use existing disclosures. These additions retain the recorded tokens and viewport strategy.

The expanded editor now uses a visible outlined Add discount button with a percent icon, alongside Add offering. Header actions are 32px high. The discount button opens the relevant Pricing controls; the table reclaims the editor width on close. Desktop, compact and phone checks for these controls are recorded in `button-viewport-verification.json`.

The 10-row density retains the existing 12px primary/table text and 10px metadata. Line spacing and thumbnail size carry the compression. Names and extra source details may still wrap naturally, and the table keeps its own scrolling. The existing five sample offerings were not changed. Verification: density-ten.json and density-ten.png under the implementation evidence folder.
