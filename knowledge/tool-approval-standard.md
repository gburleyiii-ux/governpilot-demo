# Tool Approval Standard

Write-capable external action groups must remain disabled until a human reviewer signs an approval decision. The approval record must include reviewer identity, trace ID, gate ID, decision time, and a tamper-evident signature.

Required evidence:

- Scoped service account
- Outbound egress allowlist
- Rollback playbook
- Tool call audit retention

If any required evidence is missing, the deployment remains blocked even when a reviewer has expressed support.
