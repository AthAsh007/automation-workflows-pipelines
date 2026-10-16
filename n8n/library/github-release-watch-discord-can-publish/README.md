# Announce new GitHub releases of watched repositories in Discord

Checks the releases of a list of GitHub repositories every hour, keeps only releases published since the last one announced, labels each as a major, minor or patch bump against the previous stable tag, flags breaking-change wording and posts one Discord message per release.

Import `github-release-watch-discord-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Developer communities and small teams that depend on 5 to 50 open source projects and want upgrades announced where they already talk. Major versions and breaking changes stand out from routine patches.

## How it works

1. Every hour it reads the latest releases of each repository in `WATCH`, or sample releases until `USE_GITHUB` is true. Public repositories need no token.
2. Drafts are dropped, and prereleases too unless `INCLUDE_PRERELEASES` is true. A release is new when it was published after the last one announced for that repository; a repository seen for the first time looks back `FIRST_RUN_DAYS`.
3. Each tag is parsed as a version and compared with the previous stable release to call it major, minor or patch. Release notes containing `BREAKING_WORDS` get a warning line.
4. One Discord message per release, oldest first, capped at `MAX_POSTS` per run.

## Sections on the canvas

1. **Start and settings.** Runs at 12 past every hour. The watch list, prerelease rule and breaking-change phrases live in `config`; `List watched repositories` makes one item per repository.
2. **Read releases.** The public releases endpoint needs no credential for public repositories. `Load sample releases` includes a draft, a release candidate and an old release, so every filter is exercised offline.
3. **Find and classify new releases.** Releases are grouped by the repository in their URL, so the order of the API responses does not matter. The bump is measured against the previous stable release, which keeps a release candidate from turning 3.0.0 into a patch.
4. **Post and remember.** A dry run posts nothing and records nothing. `Remember the last release` runs only after Discord accepted the posts, so a failed post is retried on the next hour.

## Setup

1. Run it once as imported. It reads sample releases and stops at `STOP: dry run - nothing posted`.
2. Fill `WATCH` with owner/name pairs and set `USE_GITHUB = true`.
3. Add a Discord bot credential to `Post the release to Discord` and set `DISCORD_CHANNEL_ID`.
4. Set `DRY_RUN = false` and activate the workflow. The last announced release per repository is kept in workflow static data.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_GITHUB` | `false` | true reads the public releases API for each repository |
| `WATCH` | `["acme-labs/widget-kit","northwind/cli"]` | owner/name of each repository to watch |
| `INCLUDE_PRERELEASES` | `false` | true also announces release candidates and betas |
| `ONLY_BUMPS` | `["major","minor","patch","other"]` | which kinds of release to announce |
| `BREAKING_WORDS` | `["breaking change","breaking:","removed ` | phrases in the notes that flag a breaking change |
| `FIRST_RUN_DAYS` | `7` | a repository seen for the first time announces releases from this many days back |
| `NOTES_CHARS` | `300` | characters of release notes quoted in the message |
| `MAX_POSTS` | `10` | hard ceiling on Discord posts per run |
| `DISCORD_CHANNEL_ID` | `''` | channel for announcements; blank skips Discord |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Post the release to Discord`

## Requirements

- A Discord server with a bot that can post in the channel
- Public GitHub repositories (or a token for private ones)

## Customising

- `ONLY_BUMPS` limits posts to, for example, `["major", "minor"]`.
- `BREAKING_WORDS` lists the phrases that mark a breaking change.
- `NOTES_CHARS` sets how much of the release notes is quoted.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample releases, dry run) | 11 | none | `STOP: dry run - nothing posted` |
| live with prereleases and Discord | 12 | `Post the release to Discord` | `Remember the last release` |
