# Shipment automation export

`process-siliconii-shipment-emails.toml` is the exported definition for the
30-minute Siliconii/KCC shipment-email workflow.

It covers:

- Gmail monitoring and attachment extraction
- AIR, OCEAN, and UPS shipment classification
- Google Drive shipment and Entry Summary folder routing
- Logistics Master 2026 `IMPORTS` row matching and physical-row-safe updates
- Entry-number write-back
- FDA review, hold, detained, and release handling
- Duplicate prevention and post-write verification

The TOML file is an operational backup, not a portable credential bundle.
Before restoring it in another Codex environment:

1. Connect Gmail and Google Drive/Sheets for the intended account.
2. Create or select a destination task thread.
3. Replace `target_thread_id` with that thread's ID.
4. Confirm the spreadsheet and Drive folder IDs still point to the intended
   resources.
5. Enable the heartbeat only after a dry-run mailbox and Sheet scan.

No Gmail messages, attachment contents, OAuth tokens, or connector credentials
are included.

