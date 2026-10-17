# Transfer your flows to the new HAFlow app

Use this guide when moving from **bptworld/haflow** to **bptworld/PixoraHQforHA** on the same Home Assistant. The new repository creates a separate app; adding it does not move your old app's data.

## 1. Export from the old app

1. Open your **existing HAFlow** app. Save any unsaved changes first.
2. In the left sidebar, expand **Library** if it is collapsed.
3. Click **Export Backup**. Keep the downloaded `haflow-backup-YYYY-MM-DD.json` file. It contains all saved flows, including their names, nodes, connections, device references and canvas positions.
4. For just one flow, select that flow and choose **Export Flow** instead. A single-flow export does not include the library name; you can rename its imported copy later.
5. Keep this file and your old app until the new installation is working. You can also create a Home Assistant backup of the old app through HA's backup settings.

**Export Backup** is the easiest choice for moving everything. It does not export HAFlow settings, logs, run history, pending runs or runtime values. It is a HAFlow JSON export, not a Home Assistant backup archive.

## 2. Stop the old app and install the new one

1. Go to **Settings → Apps → your old HAFlow app**. Turn off **Start on boot** and **Watchdog**, then click **Stop**. Do not uninstall it yet.
2. Open **Settings → Apps → App store → ⋮ → Repositories** and add:

   ```text
   https://github.com/bptworld/PixoraHQforHA
   ```

3. Refresh the store. Install **HAFlow** from **PixoraHQ for Home Assistant**, version **0.1.67 or later**. Check the repository link on the app information page if you see two HAFlow entries.
4. Start the new app and open its web interface. Its library may initially show only a Default Flow; that is normal.

## 3. Import into the new app

1. Expand **Library** in the new app's left sidebar.
2. Click **Import old HAFlow**, then **Choose backup or Flow file**.
3. Select the JSON file you downloaded in step 1. Wait for the imported-flow count to appear in the import window.
4. Close the window and use the flow selector to open the imported flows. If you had unsaved edits on the current canvas, they stay there; select an imported flow after saving those edits.

All imported flows start **paused**, even if they were running in the old app. Existing flows are kept. Matching names and IDs receive unique copies rather than replacing anything. Importing the same file again creates another set of copies, so import it only once unless you want duplicates.

## 4. Check and resume

1. Check that all expected flows appear in the selector. Open each one and verify its nodes, connections and device selections.
2. On the same Home Assistant, existing device/entity references normally stay valid. If you moved to another HA installation or renamed entities, select the correct devices in the affected nodes before running anything.
3. Confirm that the **old HAFlow app is stopped**. Resume one imported flow with **Resume**, then test its normal trigger and inspect the run log and device result. Use a safe flow first.
4. Resume the remaining flows after reviewing them. Reapply any app preferences you want and enable **Start on boot** and **Watchdog** for the new app.
5. Keep the old app stopped and retain your export until you are satisfied. Remove its old sidebar shortcut to avoid opening the wrong installation. Uninstall the old app only when you no longer need it.

## If something does not look right

- **Import old HAFlow is missing:** check that you opened the app from PixoraHQforHA and updated it to 0.1.67 or later; expand the Library section.
- **File rejected:** choose the `.json` file from HAFlow's Export Backup or Export Flow, not an HA `.tar` backup or a flow-library index file. Files must be smaller than 9 MB. An invalid flow is rejected before any flows from that file are added. Export individual flows if the full backup is too large.
- **Imported but nothing runs:** imported flows are intentionally paused. Review them and use Resume after stopping the old app.
- **Import request interrupted:** check the new flow list before importing again. The request may have completed; repeating it creates additional copies.
- **Need to go back:** stop the new HAFlow app first, then start the old app. Its saved flows were not changed by this transfer. Never run both sets of the same automations at once.

Brought to you by [PixoraHQ.com](https://pixorahq.com/).
