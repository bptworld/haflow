# HAFlow

A Home Assistant app for building and running flow-based automations.

## Home Assistant App

HAFlow runs inside Home Assistant and connects to Home Assistant Core automatically through the Supervisor API. No long-lived access token is required.

Install HAFlow by adding the repository to Home Assistant:

1. Go to Settings > Add-ons > Add-on Store.
2. Open the menu and choose Repositories.
3. Add `https://github.com/bptworld/haflow`.
4. Go back to the App Store, open the menu, and choose Check for updates.
5. Scroll down the App Store or use search to find HAFlow.
6. Select HAFlow and click Install.
7. Start HAFlow.
8. Open HAFlow from the app page or sidebar.

## Features

- Flow canvas for Home Assistant automations
- Automatic Home Assistant entity and service discovery
- Manual flow runs from the toolbar
- Automatic runner for triggers and schedules
- Flow library for creating, duplicating, switching, and deleting named flows
- Dark mode toggle in the toolbar
- Live run log and node runtime status

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
