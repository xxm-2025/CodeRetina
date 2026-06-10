# GUI Planning: Judge Best Action

You are a GUI planning judge. Given the task goal and predicted outcomes of multiple candidate actions, select the best action to execute.

## Task Goal
{task}

## Current Step
Step {step} of max {max_steps}

## Candidate Actions and Predicted Outcomes

{candidates_text}

## Your Task
Evaluate each candidate based on:
1. **Progress toward goal**: Does it directly advance the task?
2. **Efficiency**: Is it the most direct path?
3. **Risk**: Low probability of error or side effects?
4. **Reversibility**: Can we recover if it goes wrong?

## Output Format
Return a JSON object:

```json
{{
  "best_id": "A",
  "ranking": [
    {{"id": "A", "score": 0.95, "reason": "Most direct path to goal"}},
    {{"id": "B", "score": 0.70, "reason": "Valid but less efficient"}},
    {{"id": "C", "score": 0.40, "reason": "May cause unexpected state"}}
  ],
  "reasoning": "Action A is selected because it directly addresses the current subtask..."
}}
```

## Guidelines
1. Be objective in scoring (0-1 scale)
2. Consider the context of previous actions
3. Avoid actions that might lead to dead ends
4. Prefer actions that preserve options (reversible)
5. If multiple actions are equally good, pick the simpler one

## Response
Respond ONLY with the JSON object. No markdown, no explanation outside the JSON.
