# HAFlow

A Home Assistant app for building and running flow-based automations.

## Home Assistant App

HAFlow runs inside Home Assistant and connects to Home Assistant Core automatically through the Supervisor API. No long-lived access token is required.

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

## Features

- Flow canvas for Home Assistant automations
- Automatic Home Assistant entity and service discovery
- Manual flow runs from the toolbar
- Automatic runner for triggers and schedules
- Flow library for creating, duplicating, switching, and deleting named flows
- Dark mode toggle in the toolbar
- Live run log and node runtime status

See the [detailed feature list](FEATURES.md) for the full HAFlow capability overview.

## Examples

Importable example flows are included in [`examples/`](examples/):

- `simple-motion-light.json`
- `5-button-pico-example.json`

## Nodes

- Trigger
- Event
- Schedule
- Condition
- Delay
- Wait
- Action
- Notify
- Scene
- Debug
- OR
- Group

## Runner

Use the power button in the canvas toolbar to enable or pause the automatic runner. When enabled, HAFlow listens for Home Assistant events and runs matching flows automatically.

Supported automatic triggers include:

- Entity state changes
- Matching Home Assistant events
- Time-based schedules

## Stored Data

HAFlow stores runtime state in the app `/data` volume:

- `/data/config.json`
- `/data/logs.json`
- `/data/node-runtime.json`
- `/data/flows/*.json`

Home Assistant manages this app data automatically.
