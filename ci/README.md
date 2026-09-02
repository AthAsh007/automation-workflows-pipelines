# CI pipelines

Reusable GitHub Actions workflows, plus the two GitLab equivalents. Everything
here runs on the free tier: Actions minutes are unlimited on public repositories,
and every action used is either first-party or pinned to a commit SHA.

```
ci/
├── github/
│   ├── reusable-python-checks.yml   called by other repos with `uses:`
│   ├── reusable-node-checks.yml
│   ├── release-on-tag.yml           changelog, artefacts, a GitHub release
│   ├── scheduled-dependency-audit.yml
│   └── pr-hygiene.yml               title, size, and a description that exists
└── gitlab/
    └── .gitlab-ci.yml               the same gates, for GitLab CI
```

## Calling a reusable workflow

```yaml
# .github/workflows/ci.yml in the repo being tested
name: ci
on: [push, pull_request]

jobs:
  checks:
    uses: AthAsh007/automation-workflows-pipelines/.github/workflows/reusable-python-checks.yml@main
    with:
      python-versions: '["3.11", "3.12", "3.13"]'
      min-coverage: 80
```

The point of the reusable form is that the gate lives in one place. Twenty repos
copying the same 60-line workflow means twenty repos with a different idea of
what "passing" is within a quarter.

## The rules these workflows follow

**Least privilege by default.** Every workflow sets `permissions: contents: read`
at the top and raises it per job only where a job actually needs to write. The
default token permission is repository-wide, and a build step that can push tags
is a build step an injected dependency can push tags with.

**Third-party actions are pinned to a commit SHA, not a tag.** A tag is mutable.
`@v4` means "whatever the maintainer, or whoever compromises their account,
points v4 at today". First-party `actions/*` are pinned to a major version, which
is the trade-off most projects settle on.

**Nothing untrusted reaches a shell.** A PR title goes into an environment
variable and the script reads the variable. Interpolating `${{ github.event.pull_request.title }}`
straight into `run:` is script injection: the title is attacker-controlled on any
public repository.

**`pull_request`, not `pull_request_target`.** The second one runs with a
writable token in the base repository's context and has access to secrets, on
code the contributor wrote. Use it only when you know exactly why, and never to
check out the fork's code.

**Concurrency groups.** A push to a branch cancels the previous run for that
branch. Without it a busy afternoon queues six runs of a workflow whose first
five results nobody will read.

**Caching keyed on the lockfile.** `hashFiles('**/requirements*.txt')`, not the
branch name. A cache keyed on something that does not describe the dependencies
is a cache that serves stale ones.

## Prior art

The security guidance here is GitHub's own: see their hardening documentation for
script injection, `pull_request_target`, and pinning actions to a full commit SHA
(<https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions>).
The workflows are written for this repository.
