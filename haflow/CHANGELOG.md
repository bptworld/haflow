# Changelog

## 0.1.62

- Always offer equal, not-equal, greater-than, and less-than operators in Condition nodes instead of depending on entity numeric-type detection.

## 0.1.61

- Add equal, not-equal, greater-than, and less-than comparisons for numeric state triggers and conditions.
- Let numeric triggers require a comparison to remain true for a configurable number of seconds, minutes, or hours before running the flow.
- Cancel pending duration triggers when the value stops matching and re-arm them only after the comparison resets.

## 0.1.60

- Add 5% dim and brighten steps to light actions while preventing conflicting absolute brightness values.

## 0.1.59

- Add up to three actionable Android and Apple Companion App notification buttons to Notify nodes.
- Continue flows through named button outputs or a Timeout output, with configurable response time and resend attempts.
- Correlate notification responses to the correct flow run and preserve cancellation safety during waits.
- Add an Actionable Yes/No Reminder recipe demonstrating delayed follow-up and timeout handling.

## 0.1.58

- Avoid auto-selecting weak Recipe or Voice entity matches such as a generic lamp when the requested name includes more specific words.
- Prefer strong area/name matches, such as Living Room Reading Lamp, and leave weak single matches as Inspector suggestions.

## 0.1.57

- Use Home Assistant entity attributes, domains, states, and value options when resolving described Recipe and Voice flows.
- Auto-select the only plausible entity match even when its friendly name includes suffixes such as Contact Sensor.
- Preserve Open and Closed wording in generated door/opening labels while still saving the correct Home Assistant states.
- Use the matched entity domain for generated on/off actions so switches, fans, helpers, and lights call the right service domain.

## 0.1.56

- Let described Recipe and Voice flows use Home Assistant entity hints to prefill generated trigger, condition, and action nodes by entity ID.
- Show suggested entity dropdowns on generated nodes when Recipe or Voice names are close but not confident enough to auto-select.
- Match common abbreviated or partial entity wording such as "dr" for "door" and "read lamp" for "reading lamp".
- Treat "opened" as a synonym for "open" in Recipe and Voice flow descriptions.

## 0.1.55

- Make the Flow Recipes dialog body scroll so bottom controls stay reachable on shorter screens.

## 0.1.54

- Add a Voice Setup helper that generates Home Assistant Assist YAML, copies it, opens the health check, and dry-runs the voice recipe API.

## 0.1.53

- Expose HAFlow port 4177 so Home Assistant voice REST commands can call the web/API endpoint directly.

## 0.1.52

- Add a Beta note to Recipe/Voice creation surfaces inviting user feedback.

## 0.1.51

- Split the production frontend bundle into React, React Flow, icons, vendor, and app chunks to remove the Vite chunk-size warning.
- Add voice pipeline API endpoints for creating a blank flow or a described recipe flow from Home Assistant Assist.
- Add voice pipeline setup notes for Home Assistant custom sentences and REST commands.

## 0.1.50

- Add browser speech dictation for described recipes when speech recognition is available.
- Improve spoken-style recipe handling for number words, pronoun targets, and "turn on, wait, turn off" action sequences.

## 0.1.49

- Expand described recipe command support for open, close, lock, unlock, climate temperature, fan percentage, and otherwise/else branches.
- Keep brightness phrasing such as "at 50%" from being mistaken for a schedule time.

## 0.1.48

- Let described recipes fill schedule day filters, Action brightness/color payloads, and Wait timeout values from natural wording.

## 0.1.47

- Improve described recipe phrasing so trigger verbs, chained conditions, direct service calls, and message/delay/time follow-up edits are understood more naturally.

## 0.1.46

- Teach described recipes the full HAFlow node vocabulary so they can create and adjust Trigger, Event, Schedule, Condition, OR, AND, Direction, Group, Comment, Delay, Wait, End, Action, Notify, Scene, and Debug nodes.

## 0.1.45

- Let described recipes adjust the current flow from follow-up requests to add, remove, or change generated nodes.

## 0.1.44

- Add a described recipe creator that turns plain-language automation requests into editable flow nodes.
- Generate node skeletons from descriptions while leaving Home Assistant entities and services for the user to choose in each node.

## 0.1.43

- Add a Test Selected Node action that previews what the selected node would do without running the full flow or calling services.
- Add prefilled entity filters for area, type, state, and whether an entity is already used in the current flow.
- Add Comment nodes for readable canvas notes that do not change how flows run.
- Add Flow Recipes that create editable flows from real selected Home Assistant entities.
- Add a service payload builder with readable controls and prefilled dropdowns for common Home Assistant service options.

## 0.1.42

- Let Action nodes split `turn_on` and `turn_off` calls by selected entity ID domain, so mixed lights, switches, and helpers can be controlled from one node.
- Validate mixed on/off Action targets against each selected entity domain.

## 0.1.41

- Show Pushover priority and sound dropdowns when a Pushover notify service is selected.
- Merge selected Pushover options into the Notify data payload automatically.

## 0.1.40

- Make Notify nodes easier to configure by selecting available Home Assistant notify services from a dropdown.
- Add optional Notify title and data JSON fields for service-specific options such as Pushover priority and sound.

## 0.1.39

- Let Notify messages include the latest Direction node result with `{direction}`.
- Show `{direction}` usage in Notify help text.

## 0.1.38

- Add an AND node that continues only when all incoming state triggers or condition nodes are currently active.
- Let AND nodes use configurable active states when an incoming trigger does not have a specific `To` state.

## 0.1.37

- Add a Direction node that compares two active entities, determines whether movement was A to B or B to A, and writes the result to an `input_text` or `input_select` helper.
- Move the Show Last Run toolbar button before the light/dark theme button.

## 0.1.36

- Fix Schedule nodes so they also act as time gates when reached from another node, stopping downstream actions outside the configured time/day window.
- Hide unused incoming handles on Trigger and Event nodes.

## 0.1.35

- Add advanced Schedule node options for exact times, sunrise, sunset, time ranges, overnight ranges, and selected days of the week.
- Make Schedule triggers evaluate ranges once when entering the active window, including ranges that cross midnight.
- Add reusable GitHub push instructions so future commits include release notes, version bumps, validation, and PR/merge hygiene.

## 0.1.34

- Add flow renaming with duplicate-name protection.

## 0.1.33

- Add a 2-button Pico controller example flow and include it in the Starter Pack.

## 0.1.32

- Prevent duplicate flow names by automatically numbering new or copied flows.

## 0.1.31

- Suppress placeholder action validation warnings inside button-controller groups.

## 0.1.30

- Limit paused flow highlighting to only the `[Paused]` marker in the flow picker.

## 0.1.29

- Reduce connection snapping so link lines feel stable again when lining up handles.

## 0.1.28

- Highlight paused flows in orange in the flow dropdown and selected flow field.

## 0.1.27

- Show human-readable action tile text such as `Turn on light` instead of raw Home Assistant service names like `Run light.turn_on`.

## 0.1.26

- Tighten binary sensor state labels to match Home Assistant device-class meanings for motion, occupancy, presence, contact/opening, light, lock, and power sensors.
- Infer common binary sensor classes from entity names when Home Assistant does not provide a device class.

## 0.1.25

- Change node tile summaries to describe configured behavior instead of showing current entity status now that the canvas Devices panel shows live status.

## 0.1.24

- Make tight canvas connections easier by increasing the snap radius and allowing loose handle starts while keeping End nodes terminal-safe.

## 0.1.23

- Make the outgoing-link validation rule explicit so action and terminal nodes can intentionally end a branch without warnings.

## 0.1.22

- Add an End node that terminates a branch without running an action and resolves intentional `No outgoing link` warnings.

## 0.1.21

- Display binary sensor states using Home Assistant device-class labels, such as door sensors showing `Open` and `Closed` while preserving raw `on` and `off` values for runner logic.

## 0.1.20

- Add an upper-left canvas device status panel showing every entity and device-only trigger used by the current flow in alphabetical order with live Home Assistant state where available.

## 0.1.19

- Use a cable-style Home Assistant sidebar icon to match the HAFlow header icon.

## 0.1.18

- Make Run History collapsible.
- Remember the Run History open or closed state across refreshes and app restarts.

## 0.1.17

- Show flow activation log entries as green `Flow Activated` messages.
- Highlight warning log entries in orange and error log entries in red.

## 0.1.16

- Speed up flow execution by running start nodes, branches, and condition checks in parallel.
- Check service results immediately and retry faster.
- Add search to the expanded Run Log popup.
- Force the automatic runner on at app startup.

## 0.1.15

- Show watched trigger entity IDs in the Run Log startup diagnostics.
- Warn when triggers are configured but the automatic runner is disabled.
- Match device-based state triggers against real Home Assistant entities from that device.

## 0.1.14

- Move the Run Log under the left panel runner controls.
- Show a compact live 10-entry log preview with a wide scrollable popup.

## 0.1.13

- Add trigger diagnostics for watched Home Assistant entity changes.
- Mirror HAFlow run log messages to stdout for easier app log review.
- Hide routine auto-save entries from the Run Log.

## 0.1.12

- Fix automatic triggers so the runner watches every saved, unpaused flow instead of only the currently active flow.
- Preserve grouped device button matching when flows run in the background.
- Cache runnable flows in memory so event matching stays fast.

## 0.1.11

- Make the Library section collapsible and remember its open or closed state.
- Move single-flow import and export actions into the Library section with backup actions.

## 0.1.10

- Add whole-library backup export and import for all saved flows.
- Add persistent run history with trigger, outcome, duration, and nodes touched.
- Add a toolbar action to run from the selected node.
- Add stronger validation for paused flows, missing triggers, stale entities, invalid services, and missing targets.
- Add a Starter flow pack with prefixed sample flows.

## 0.1.9

- Show the latest flow trigger time in the toolbar summary.
- Add multi-node alignment controls that appear only when multiple nodes are selected.

## 0.1.8

- Update the 5-button Pico example to show the grouped controller device-name subtitle.

## 0.1.7

- Show the selected Pico device name in bold under grouped 5-button controller titles.

## 0.1.6

- Resize flow action buttons so Pause and Resume labels fit cleanly.

## 0.1.5

- Add Home Assistant-visible changelog.

## 0.1.4

- Fix browser compatibility issue when generating IDs in the Home Assistant web view.
- Prevent blank-screen crashes by using a browser-safe ID fallback.

## 0.1.3

- Add importable example flows:
  - Simple motion light flow
  - 5-button Pico controller template

## 0.1.2

- Clarify Home Assistant repository installation steps.

## 0.1.1

- Convert HAFlow into a Home Assistant app repository layout.
- Add repository metadata for GitHub-based installation.
- Add app-only documentation and Home Assistant install instructions.

## 0.1.0

- Initial HAFlow Home Assistant app package.
- Add ingress support.
- Add Home Assistant Supervisor API connection.
- Add flow editor, runner, flow library, dark mode, and runtime log.
