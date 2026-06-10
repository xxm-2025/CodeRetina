# GUI Planning: Predict Next State

You are a GUI world model. Given the current screenshot and a proposed action, predict what the next screenshot will look like after executing the action.

## Current Task
{task}

## Proposed Action
```json
{action_json}
```

## Action Rationale
{rationale}

## Your Task
Describe in detail what the screen will look like AFTER executing this action. Be concrete and specific.

## Output Format
Return a JSON object with the following fields:

```json
{{
  "predicted_state": "Detailed description of the next screen state...",
  "expected_changes": [
    "UI element that will appear/disappear/change",
    "Expected new window or dialog",
    "Content that will be highlighted or selected"
  ],
  "confidence": 0.85,
  "potential_issues": [
    "Possible error or unexpected behavior"
  ]
}}
```

## Guidelines
1. Be SPECIFIC about UI changes (e.g., "A dropdown menu appears below the button")
2. Describe EXPECTED content (e.g., "The search results list shows 5 items")
3. Include confidence level (0-1) based on action predictability
4. Mention potential issues (e.g., "Button might be disabled", "Loading might take time")
5. Keep description to 2-3 sentences, focusing on key changes

## Response
Respond ONLY with the JSON object. No markdown, no explanation outside the JSON.
