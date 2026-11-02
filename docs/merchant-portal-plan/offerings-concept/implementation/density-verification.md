# Offerings density adjustment

31 October 2026. The user revised the target from twelve to ten visible rows.

The isolated browser check uses twelve representative product records at 1280 × 633 CSS pixels and device scale 1.5, matching the approximate zoom in the supplied screenshot. Before compression, four complete rows were visible at 75px each. The final layout displays ten complete rows at 37px each, with 12px primary text retained and no document overflow. Remaining records scroll inside the table.

The check also selected a row, reopened its editor and verified that the phone publication controls remain inside the viewport. The original five sample offerings and all workflow/backend configuration are unchanged.

Evidence: density-before.json, density-ten.json, density-ten.png and density-mobile.png. The detector reported no layout diagnostics in the scoped scan; the design assessment identified thumbnails, cell padding and stacked metadata spacing as the density constraints.
