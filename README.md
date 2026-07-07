# HAFlow

A Home Assistant app repository for HAFlow, a flow-based automation editor and runner.

## Installation

To install this app, follow these steps:

1. Navigate to the app store in the Home Assistant UI: **Supervisor** in the left menu, then **Add-on Store** on the top tab.
2. Select the three vertical dots in the upper right-hand corner and select **Repositories**.
3. In the **Manage add-on repositories** screen, enter this project's GitHub page URL and click **Add**:

   ```text
   https://github.com/bptworld/haflow
   ```

4. After adding the repository, go back to the **App Store**, select the three vertical dots in the upper right-hand corner, and select **Check for updates**.
5. Scroll down the **App Store** or use search to find **HAFlow**.
6. Select **HAFlow** and click **Install**.
7. Start HAFlow and open it from the app page or sidebar.

## App

The HAFlow app source is in [`haflow/`](haflow/).

HAFlow runs inside Home Assistant and connects to Home Assistant Core automatically through the Supervisor API. No long-lived access token is required.

## Examples

Example importable flows are available in [`haflow/examples/`](haflow/examples/):

- `simple-motion-light.json`
- `5-button-pico-example.json`
