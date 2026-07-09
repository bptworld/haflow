# HAFlow Voice Pipeline

HAFlow exposes voice-friendly API endpoints that Home Assistant Assist can call from custom sentences or intent scripts.

Creating recipes is in Beta. Your feedback is welcome!

HAFlow exposes port `4177` for voice REST commands. After installing this app version, restart/reinstall HAFlow if Home Assistant has not picked up the new port mapping yet.

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

The generated flow uses editable HAFlow nodes and leaves entity IDs blank so the flow can be reviewed and finished in the app.

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
