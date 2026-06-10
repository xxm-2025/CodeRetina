# GUI Planning: Propose Actions

You are a GUI planning agent. Given a screenshot and a task goal, propose {k} distinct atomic actions that could advance the task.

## Task Goal
{task}

## Current State
You are looking at a screenshot of the computer screen. Based on what you see, propose {k} different ways to make progress toward the goal.

## Action Space
Available action types:
- `click(x, y)`: Click at screen coordinates (x, y)
- `type(text)`: Type the given text
- `scroll(direction, amount)`: Scroll up/down/left/right
- `hotkey(keys)`: Press keyboard shortcut (e.g., ["cmd", "c"])
- `wait(ms)`: Wait for UI to settle
- `done`: Mark task as complete

## Output Format
Return a JSON array with exactly {k} candidate actions:

```json
[
  {{
    "id": "A",
    "action": {{
      "type": "click",
      "params": {{"x": 100, "y": 200}}
    }},
    "rationale": "Click on the Settings button to access configuration options"
  }},
  {{
    "id": "B",
    "action": {{
      "type": "type",
      "params": {{"text": "search query"}}
    }},
    "rationale": "Type the search term to find relevant content"
  }},
  {{
    "id": "C",
    "action": {{
      "type": "hotkey",
      "params": {{"keys": ["cmd", "f"]}}
    }},
    "rationale": "Open find dialog to locate specific text on page"
  }}
]
```

## Guidelines
1. Each action should be atomic and executable
2. Actions should be diverse (different strategies)
3. Include coordinates for clicks when relevant
4. Explain WHY each action helps achieve the goal
5. Consider both direct and indirect approaches

## Response
Respond ONLY with the JSON array. No markdown, no explanation outside the JSON.
