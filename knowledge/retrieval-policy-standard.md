# Retrieval Policy Standard

Retrieval policy drift occurs when the active knowledge source set no longer matches the approved governance memory. Drift can surface stale retention rules, unapproved PII handling guidance, conflicting policy language, or citations outside the allowlisted source set.

Required controls:
- Maintain an approved retrieval allowlist for governance and security documents.
- Reject or quarantine retrieved content that conflicts with the active policy baseline.
- Rerun retrieval-policy drift evals after source changes, embedding updates, or policy refreshes.
- Include citation provenance and source-path evidence in the audit export.

If retrieval-policy drift evals fail, the deployment remains blocked until the allowlist is refreshed and the eval pack passes.
