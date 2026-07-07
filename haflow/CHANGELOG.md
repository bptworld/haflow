# Changelog

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
