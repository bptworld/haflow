# HAFlow Voice Pipeline

HAFlow exposes voice-friendly API endpoints that Home Assistant Assist can call from custom sentences or intent scripts.

Creating recipes is in Beta. Your feedback is welcome!

HAFlow exposes port `4177` for voice REST commands. After installing this app version, restart/reinstall HAFlow if Home Assistant has not picked up the new port mapping yet.

The easiest setup path is **HAFlow > Library > Voice Setup**, which generates the YAML below with your HAFlow URL and includes a dry-run API test.

## Endpoints

### Create A Blank Flow

`POST /api/voice/flow`

```json
{
  "name": "Bathroom Lights"
}
```

### Create A Flow From A Recipe Description

`POST /api/voice/recipe`

```json
{
  "recipe": "when bathroom door closes, turn on vanity lights"
}
```

HAFlow tries to resolve names against Home Assistant entity data. Generated flows are still editable, and unresolved targets stay as placeholders so the flow can be reviewed and finished in the app.

If HAFlow finds close entity matches but cannot confidently choose one, the generated node keeps the entity blank and shows the close matches as a suggested dropdown in the Inspector. Close matching understands common abbreviated or partial wording such as `dr` for `door`, `bath` for `bathroom`, and `read lamp` for `reading lamp`.

When an entity is resolved, HAFlow uses its Home Assistant domain, device class, state, and value options. For example, a binary door sensor keeps Home Assistant `off -> on` internally but shows `Closed -> Open` wording, while a cover-style garage door can use `closed -> open`.

When Home Assistant or another caller already knows the exact entities, include entity hints so HAFlow can build nodes by ID:

```json
{
  "recipe": "if front door is opened, turn on reading lamp",
  "entities": [
    { "name": "front door", "entity_id": "binary_sensor.front_door_contact" },
    { "name": "reading lamp", "entity_id": "light.reading_lamp" }
  ]
}
```

## Home Assistant Example

Use the HAFlow app URL that works from your Home Assistant instance.

```yaml
rest_command:
  haflow_create_flow:
    url: "http://YOUR_HAFLOW_HOST:4177/api/voice/flow"
    method: post
    content_type: "application/json"
    payload: >
      {"name":"{{ name }}"}

  haflow_create_recipe:
    url: "http://YOUR_HAFLOW_HOST:4177/api/voice/recipe"
    method: post
    content_type: "application/json"
    payload: >
      {"recipe":"{{ recipe }}"}
```

```yaml
conversation:
  intents:
    HAFlowCreateFlow:
      - "make a flow called {name}"
      - "create a flow called {name}"
      - "build a flow called {name}"
    HAFlowCreateRecipe:
      - "make a flow {recipe}"
      - "create a flow {recipe}"
      - "build a recipe {recipe}"

intent_script:
  HAFlowCreateFlow:
    action:
      - action: rest_command.haflow_create_flow
        data:
          name: "{{ name }}"
    speech:
      text: "Created the HAFlow flow."

  HAFlowCreateRecipe:
    action:
      - action: rest_command.haflow_create_recipe
        data:
          recipe: "{{ recipe }}"
    speech:
      text: "Created the HAFlow recipe flow."
```

Example spoken command:

`make a flow when bathroom door closes, turn on vanity lights`
