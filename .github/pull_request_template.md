## What this changes

<!-- One or two sentences. What does the template do now that it did not before? -->

## Checks

- [ ] `python tools/check-fixtures.py .` passes
- [ ] `python tools/validate-workflows.py .` passes
- [ ] No real customer, lead or employee data in any file, including fixtures
- [ ] No credential, token or webhook URL with a secret in it
- [ ] New fixture addresses are at `.example` domains, new phone numbers are `555-01xx`
- [ ] A new workflow ships with its preview or dry-run flag set to the safe value
- [ ] Prose follows [docs/SANITIZATION.md](../docs/SANITIZATION.md)
