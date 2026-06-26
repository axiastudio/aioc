# AIOC Harness Descriptor Authoring Notes

Return the candidate harness as plain YAML. Do not wrap it in Markdown fences.

An AIOC harness descriptor is a mapping with two required sections:

```yaml
runtime:
  entry_agent: explainer
  max_turns: 4
agents:
  explainer:
    model: model-name
    instructions: |-
      Agent instructions go here.
```

`agents` is a mapping keyed by agent id. In this example the entry agent id is
`explainer`.

Tool declarations are mappings, not lists. The key is the logical tool id used
by agents. The value contains the application-owned target:

```yaml
tools:
  logical_tool_id:
    target: example://tool/target_name
```

Agents attach tools by referencing those logical ids:

```yaml
agents:
  explainer:
    tools: [logical_tool_id]
```

Do not write descriptor tools like this:

```yaml
tools:
  - name: logical_tool_id
    target: example://tool/target_name
```

Descriptors do not contain executable tool code. The application binds each
declared `target` to a real tool implementation outside the descriptor.

If the candidate does not need a tool, omit both the top-level `tools` section
and the agent `tools` list.
