> [!WARNING]
> **DEPRECATED — Home Assistant app moved to PixoraHQforHA.**
>
> Use **[PixoraHQforHA](https://github.com/bptworld/PixoraHQforHA)** for new installations and future HA app releases.
> This app's new directory is **[haflow](https://github.com/bptworld/PixoraHQforHA/tree/main/haflow)**.
>
> Existing installs keep working: this directory and its code have been retained.
> No automatic migration occurs. Back up settings/data and stop the old app before
> starting a replacement from the new repository. Keep the old install until the
> replacement is verified. Other platform components in this repository are unaffected.

# HAFlow

A Home Assistant app for HAFlow, a flow-based automation editor and runner.

## Move your flows to the new HAFlow

**Your saved flows can be transferred.** Follow the [complete transfer instructions](TRANSFER_FLOWS.md) before changing installations.

In the old app, save your edits and choose **Library → Export Backup**. In the new HAFlow (0.1.67 or later), choose **Library → Import old HAFlow** and select that JSON file. Imported flows are separate paused copies. Stop the old app before starting the replacement; review the imports before resuming them. Keep the old app and export until you have verified the new installation.

New installations belong in [PixoraHQforHA](https://github.com/bptworld/PixoraHQforHA/tree/main/haflow). The old code below remains available for existing installs.

## Installation

To install this app, follow these steps:

1. Navigate to the app store in the Home Assistant UI: **Settings**, **Apps**, then **Install App**.
2. Select the three vertical dots in the upper right-hand corner and select **Repositories**.
3. On the bottom of the **Repositories** screen, click **Add**,
4. Enter this project's GitHub page URL and click **Add**:
   ```text
   https://github.com/bptworld/haflow
   ```

5. After adding the repository, go back to the **App Store**, select the three vertical dots in the upper right-hand corner, and select **Check for updates**.
6. Scroll down the **App Store** or use search to find **HAFlow**.
7. Select **HAFlow** and click **Install**.
8. Start HAFlow and open it from the app page or sidebar.

## App

The HAFlow app source is in [`haflow/`](haflow/).

HAFlow runs inside Home Assistant and connects to Home Assistant Core automatically through the Supervisor API. No long-lived access token is required.
NOTE: This does not need HACS, this is a HA App!

## Features

See the [detailed feature list](haflow/FEATURES.md) for the full HAFlow capability overview.

## Examples

Example importable flows are available in [`haflow/examples/`](haflow/examples/):

- `simple-motion-light.json`
- `5-button-pico-example.json`
