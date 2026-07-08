# HAFlow

A Home Assistant app for HAFlow, a flow-based automation editor and runner.

<a href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fbptworld%2Fhaflow" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg" alt="Open your Home Assistant instance and show the add app repository dialog with a specific repository URL pre-filled." /></a>

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

## Examples

Example importable flows are available in [`haflow/examples/`](haflow/examples/):

- `simple-motion-light.json`
- `5-button-pico-example.json`
