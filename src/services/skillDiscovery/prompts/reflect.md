# Skill Discovery Reflection Prompt

You are reviewing a coding session transcript. Identify 0-3 reusable skills.

A "skill" is a reusable workflow that worked successfully in this session. It should be a pattern that could help in similar future tasks.

Be strict: only extract if the same procedure would help in a similar future task. Avoid extracting:
- One-off tasks with no generalization value
- Failed or incomplete attempts
- Tasks that are too specific to a particular file or codebase

For each skill you identify, provide:

1. **name**: A kebab-case identifier (e.g., "screenshot-to-tailwind-card")
2. **description**: One-line summary of what the skill does
3. **when_to_use**: Clear criteria for when this skill should be invoked
4. **instructions**: Step-by-step procedure (markdown format) that worked in this session
5. **allowed_tools**: List of tool names used in the workflow
6. **evidence**: Which session steps demonstrated this pattern

Output format: JSON array

```json
[
  {
    "name": "screenshot-to-tailwind-card",
    "description": "Convert a UI screenshot to a Tailwind React card component",
    "when_to_use": "User provides a card-like UI screenshot and asks to recreate it as React code",
    "instructions": "1. Use VisionQATool to extract UI structure and styling details from the screenshot\n2. Analyze the component hierarchy and identify Tailwind classes needed\n3. Use FileWriteTool to create a React component with Tailwind styling\n4. Verify the output matches the original design",
    "allowed_tools": ["VisionQATool", "FileWriteTool", "BashTool"],
    "evidence": ["session_xxx step 3-8"]
  }
]
```

If nothing reusable was found, output an empty array: `[]`

Rules:
- Instructions should be actionable and specific
- Allowed tools must be from the existing tool registry
- Evidence should reference specific steps or tool calls
- Keep descriptions concise but complete
