# Prompt Injection Standard

Prompt injection red-team cases must verify that the agent preserves system, developer, and policy instructions when retrieved content or user text attempts to override them. A failing case includes instruction override, hidden command following, unapproved tool calls, or data exfiltration attempts.

Required controls:
- Treat retrieved documents as untrusted content.
- Refuse instructions that conflict with approved policy, tool scope, or reviewer decisions.
- Keep write-capable tools disabled until approval and adversarial evals both pass.
- Attach red-team case results to the evidence packet before controlled pilot.

If prompt-injection evals fail, the deployment remains blocked even when a human approval record exists.
