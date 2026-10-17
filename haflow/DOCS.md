# HAFlow setup and Flow transfer

**HAFlow has moved — transfer your saved flows to PixoraHQforHA.**

1. Open the **old HAFlow** app, save changes, expand **Library**, and choose **Export Backup**. Keep the downloaded JSON file.
2. In **Settings → Apps → the old HAFlow**, turn off **Start on boot** and **Watchdog**, then **Stop** it. Keep it installed until the transfer is verified.
3. Add `https://github.com/bptworld/PixoraHQforHA` under **App store → ⋮ → Repositories**. Install **HAFlow from PixoraHQ for Home Assistant**, version **0.1.68 or later**, then start and open it.
4. Click the bold transfer notice's **Import old HAFlow** button in the new app. Choose your exported JSON file. Single **Export Flow** files also work.
5. Close the import window, select each imported flow, and check its devices and connections. **Imported flows start paused; existing flows are preserved.**
6. With the old app stopped, click **Resume** for the reviewed flows and test their triggers. Enable **Start on boot** and **Watchdog** for the new app after checking it works.

**Do not run both copies of the same automations.** Keep the old app stopped and retain your export. Settings, logs, history and pending timers do not transfer. Device references are retained; check them if you moved to another Home Assistant. Import the file once: importing again creates additional copies.

**Need to go back?** Stop the new app first, then start the old one. The old app's saved flows are unchanged. Never uninstall the old app until you have verified the new one.

For a new installation without old flows, start the app and create a new flow. Home Assistant connects automatically; no access token is required.

Brought to you by [PixoraHQ.com](https://pixorahq.com/).
