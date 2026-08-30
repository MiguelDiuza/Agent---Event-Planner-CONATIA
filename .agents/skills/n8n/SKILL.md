---
name: n8n-workflow-expert
description: >-
  Expert guidelines, schemas, node patterns, code node templates, and best practices
  for creating, validating, modifying, and debugging n8n workflows, AI Agents in n8n,
  webhook integrations, and JSON export/import structures.
---

# n8n Workflow Engineering Skill

This skill guides the design, generation, modification, and debugging of n8n workflows, AI Agent nodes, sub-workflows, and API integrations.

---

## 1. Core Architecture & Workflow JSON Structure

An n8n workflow file is a JSON object with the following primary keys:

```json
{
  "name": "Workflow Name",
  "nodes": [
    {
      "parameters": {},
      "id": "uuid-v4",
      "name": "Node Name",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [250, 300]
    }
  ],
  "connections": {
    "Node Name": {
      "main": [
        [
          {
            "node": "Next Node Name",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
```

### Essential Rules for Workflow JSON Generation
- **Unique IDs & Names**: Every node must have a unique `id` (UUID) and unique `name`.
- **Connections Map**: Keys in `connections` match the source node's `name`. The target is referenced via `node: "Target Node Name"`.
- **Positioning**: Space nodes consistently on the canvas (e.g., `position: [x, y]` with `Δx ≈ 200-250px`, `Δy ≈ 150px`).
- **Pins & Data Format**: All outputs in n8n standard nodes must be an array of objects `[ { json: { ... }, binary: { ... } } ]`.

---

## 2. Expression Syntax Reference

n8n uses JMESPath and JavaScript expressions wrapped in `{{ }}`:

| Pattern | Expression | Description |
| :--- | :--- | :--- |
| Current Item Property | `{{ $json.fieldName }}` | Value of `fieldName` in the incoming item |
| Specific Node Output | `{{ $('Node Name').item.json.fieldName }}` | Property from single-item output of another node |
| Specific Node Array | `{{ $('Node Name').all() }}` | All items output by another node |
| Environment Variable | `{{ $env.VAR_NAME }}` | Read environment variables configured in n8n |
| Execution Metadata | `{{ $execution.id }}` / `{{ $workflow.id }}` | Current execution or workflow ID |
| Date & Time (Luxon) | `{{ $now.toISO() }}` / `{{ $today.plus({ days: 1 }).toFormat('yyyy-MM-dd') }}` | Built-in Luxon date manipulation |

---

## 3. Code Node (JavaScript & Python) Best Practices

### JavaScript (Run Once for All Items vs Run Once for Each Item)
```javascript
// Run Once for All Items
const results = [];
for (const item of $input.all()) {
  const data = item.json;
  results.push({
    json: {
      id: data.id,
      processedAt: new Date().toISOString(),
      isValid: Boolean(data.email && data.phone)
    }
  });
}
return results;
```

### Python
```python
# Run Once for All Items
items = _input.all()
results = []
for item in items:
    data = item.get("json", {})
    results.append({
        "json": {
            "id": data.get("id"),
            "status": "processed"
        }
    })
return results
```

---

## 4. AI Agents & LangChain in n8n

When building AI Agents within n8n (`@n8n/n8n-nodes-langchain`):
- **Agent Node**: `n8n-nodes-langchain.agent` (Tools Agent, Plan and Execute, Conversational Agent).
- **Model Node**: Connect LLM sub-nodes (OpenAI Chat Model, Anthropic, Google Gemini) via `ai_languageModel` connection.
- **Memory Node**: Connect Window Buffer Memory or Motorhead/Redis via `ai_memory` connection.
- **Tools**: Connect Custom Tool sub-workflows, HTTP Tool, Code Tool, or Vector Store via `ai_tool` connection.
- **Output Parser**: Connect Structured Output Parser when deterministic JSON is required.

---

## 5. Webhooks & API Integration Patterns

1. **Webhook Response**:
   - For fast async replies, use `Respond: Immediately` with HTTP 200 / 202.
   - For synchronous pipelines, use the `Respond to Webhook` node at the end of the chain.
2. **Error Trigger & Error Handling**:
   - Configure a dedicated Error Trigger workflow for alerts (Telegram, Slack, Email).
   - Use `Continue on Fail` or `Error Output` branch on risky HTTP Request nodes.
3. **Database Operations (Supabase / Postgres)**:
   - Always sanitize inputs and use parameterized SQL or native resource operations (e.g. `upsert`, `filter`).

---

## 6. Validation Checklist Before Saving / Importing Workflows
- [ ] Valid JSON syntax.
- [ ] No dangling connections (all connected node names exist in `nodes`).
- [ ] Credentials referenced match placeholder or environment configurations.
- [ ] Expressions use correct `$('Node Name').item.json...` syntax.
- [ ] Default values provided for optional fields to avoid runtime `undefined` crashes.
