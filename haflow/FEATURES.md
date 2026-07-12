# HAFlow Features

HAFlow is a Home Assistant app for building and running flow-based automations.

## Core App

- Runs as a Home Assistant app through the Home Assistant Apps interface.
- Connects to Home Assistant Core automatically through the Supervisor API.
- Does not require a long-lived access token.
- Supports Home Assistant ingress/sidebar access.
- Discovers Home Assistant entities and services automatically.
- Shows live connection details, including entity and service counts.
- Uses versioned app metadata from `package.json`.

## Flow Canvas

- Visual node-based automation editor.
- Drag and drop nodes on a canvas.
- Connect nodes with branch links.
- Run the current flow manually from the toolbar.
- Run from the selected node.
- Duplicate nodes.
- Group selected nodes into same-screen subflows.
- Select and align multiple nodes.
- Use undo and redo keyboard shortcuts.
- Auto-save flow edits.
- Toggle dark and light mode.
- View a canvas device status panel for entities and devices used by the current flow.
- See live node runtime status, including running, completed, and stopped states.
- See the latest trigger time in the toolbar.
- Test the selected node and preview what it would do without running the full flow.
- Add Comment nodes for readable canvas notes that do not change how flows run.

## Flow Library

- Create named flows.
- Rename flows with duplicate-name protection.
- Duplicate flows.
- Switch between saved flows.
- Delete flows.
- Pause and resume individual flows.
- Highlight paused flows in the flow picker.
- Import and export a single flow.
- Export and import whole-library backups.
- Import starter flow packs.
- Create new editable flows from guided recipes using real Home Assistant entities.
- Create editable node skeletons from plain-language recipe descriptions, then fill in the exact Home Assistant data in each node.
- Prefill described Recipe and Voice flows by entity ID when Home Assistant entity hints or matching entity names are available.
- Show close entity matches as suggested dropdowns when a described Recipe or Voice flow cannot confidently choose the exact entity.
- Use matched Home Assistant entity domains, device classes, current states, and value options to choose sensible trigger states and action service domains.
- Adjust the current flow from follow-up recipe requests that add, remove, or change generated nodes.
- Understand the full HAFlow node vocabulary when creating and adjusting described recipes.
- Understand natural follow-up phrasing for trigger verbs, chained conditions, direct service calls, message text, delays, and schedule times.
- Fill schedule day filters, Action brightness/color payloads, and Wait timeout values from described recipes.
- Understand broader action commands such as open, close, lock, unlock, set thermostat temperature, set fan percentage, and otherwise/else branches.
- Dictate described recipes in browsers with built-in speech recognition, including spoken number words and pronoun follow-ups.
- Create blank flows or described recipe flows from Home Assistant Assist through voice pipeline API endpoints.
- Pass resolved Home Assistant entity hints into voice recipes so generated nodes can target exact entity IDs.
- Watch all saved, unpaused flows with the automatic runner, not only the currently open flow.

## Voice Pipeline

- Create a blank flow through `POST /api/voice/flow`.
- Create an editable recipe flow through `POST /api/voice/recipe`.
- Generate Home Assistant Assist YAML from the Voice Setup helper in the app.
- Creating recipes is in Beta. Your feedback is welcome!
- See `VOICE_PIPELINE.md` for Home Assistant custom sentence examples.

## Runner

- Listens to Home Assistant events when enabled.
- Supports entity state-change triggers.
- Supports Home Assistant event triggers.
- Supports time and schedule triggers.
- Runs matching flows in the background.
- Runs start nodes, branches, and condition checks in parallel.
- Caches runnable flows for fast event matching.
- Cancels or replaces previous runs where appropriate.
- Tracks node runtime state.
- Stores persistent run history with trigger, result, duration, and touched nodes.
- Shows a live run log with searchable expanded view.
- Highlights activation, warning, and error log states.
- Mirrors HAFlow run log messages to stdout for app log review.

## Node Types

- `Trigger`: starts a flow when an entity changes state.
- `Event`: starts a flow from Home Assistant events, optionally filtered.
- `Schedule`: starts or gates a flow by time, sunrise, sunset, ranges, and weekdays.
- `Condition`: branches through true or false outputs by entity state or attribute.
- `OR`: continues when any incoming path reaches it.
- `AND`: continues only when all incoming triggers or conditions are currently active.
- `Direction`: compares two active entities and writes movement direction to a helper.
- `Group`: frames nodes as a movable, copyable, deletable subflow.
- `Comment`: adds readable notes to the canvas without changing how the flow runs.
- `Delay`: pauses for a fixed time.
- `Wait`: pauses until an entity reaches a state or timeout.
- `End`: intentionally stops a branch.
- `Action`: runs Home Assistant services.
- `Notify`: sends Home Assistant notifications.
- `Scene`: activates scenes.
- `Debug`: writes trace messages to the run log.

## Action Features

- Select one or more target entities.
- Choose a Home Assistant service domain and service.
- Build common service payloads with readable controls and prefilled dropdowns.
- Configure JSON payloads.
- Show shared attributes for selected entities.
- Validate missing services, missing targets, bad JSON, and stale entities.
- Verify `turn_on` and `turn_off` results after service calls.
- Split mixed `turn_on` and `turn_off` targets by entity ID domain.
- Control mixed lights, switches, and helpers from one Action node when each selected domain supports the on/off service.
- Use entity IDs and domains for routing, not friendly names.

## Notify Features

- Select available Home Assistant notify services.
- Use custom notify service targets.
- Configure message and title fields.
- Add up to three actionable notification buttons with action IDs and optional dashboard or URL targets; actionable buttons require the Home Assistant Companion App on the receiving device.
- Continue through the output for the pressed notification button, or through Timeout after configurable response time and resend attempts.
- Show each notification button label as a named output on the flow node, enabling patterns such as Yes to close a garage door and No to end the branch.
- Configure a data JSON field.
- Include the latest Direction node result with `{direction}`.
- Select Pushover priority from a dropdown.
- Select Pushover sound from a dropdown.
- Merge selected Pushover options into the notification payload automatically.

## Schedule Features

- Exact time schedules.
- Sunrise schedules.
- Sunset schedules.
- Time ranges.
- Overnight ranges.
- Selected weekdays.
- Schedule nodes can start a flow.
- Schedule nodes can also gate a branch when reached from another node.

## Condition And State Features

- Compare entity states.
- Compare entity attributes.
- Configure multiple condition rules.
- Use any/all condition modes.
- Display human-readable binary sensor labels based on Home Assistant device class.
- Show common binary sensor states such as Open/Closed, Detected/Clear, and Home/Away.
- Preserve raw `on` and `off` values internally for runner logic.

## Device And Entity Support

- Build an entity catalog from Home Assistant.
- Filter the entity picker by area, type, current state, and whether an entity is already used in the current flow.
- Use area, device, and entity registry discovery.
- Include device-only entries for devices without state entities.
- Show live status for entities used by the current flow.
- Support Pico/Lutron 5-button controller examples and grouped flows.
- Match device-based state triggers against real Home Assistant entities from that device.
- Support helpers where Home Assistant exposes services, including `input_boolean` for on/off and `input_text` or `input_select` for Direction output.

## Validation And Diagnostics

- Validate missing trigger nodes.
- Validate paused flows.
- Validate missing entities.
- Validate stale or deleted entities.
- Validate missing service domains and services.
- Validate invalid services.
- Validate missing Action targets.
- Validate bad JSON payloads.
- Suppress placeholder action warnings inside button-controller groups.
- Show watched trigger entity IDs in startup diagnostics.
- Warn when triggers are configured but the automatic runner is disabled.

## Examples

- `simple-motion-light.json`
- `5-button-pico-example.json`
- `2-button-pico-example.json`
- Starter Pack import support.
- Flow Recipes for motion light timeout, door-left-open notification, and scheduled scene flows.
- An actionable Yes/No reminder recipe demonstrating button branches, delayed follow-up, resends, and timeout handling.
