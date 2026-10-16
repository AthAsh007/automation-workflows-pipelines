# Announce new GitHub releases of watched repositories in Discord

**Who's it for**
Developer communities and small teams that depend on 5 to 50 open source projects and want upgrades announced where they already talk. Major versions and breaking changes stand out from routine patches.

**How it works**
1. Every hour it reads the latest releases of each repository in `WATCH`, or sample releases until `USE_GITHUB` is true. Public repositories need no token.
2. Drafts are dropped, and prereleases too unless `INCLUDE_PRERELEASES` is true. A release is new when it was published after the last one announced for that repository; a repository seen for the first time looks back `FIRST_RUN_DAYS`.
3. Each tag is parsed as a version and compared with the previous stable release to call it major, minor or patch. Release notes containing `BREAKING_WORDS` get a warning line.
4. One Discord message per release, oldest first, capped at `MAX_POSTS` per run.

**How to set up**
1. Run it once as imported. It reads sample releases and stops at `STOP: dry run - nothing posted`.
2. Fill `WATCH` with owner/name pairs and set `USE_GITHUB = true`.
3. Add a Discord bot credential to `Post the release to Discord` and set `DISCORD_CHANNEL_ID`.
4. Set `DRY_RUN = false` and activate the workflow. The last announced release per repository is kept in workflow static data.

**Requirements**
- A Discord server with a bot that can post in the channel
- Public GitHub repositories (or a token for private ones)

**How to customize**
- `ONLY_BUMPS` limits posts to, for example, `["major", "minor"]`.
- `BREAKING_WORDS` lists the phrases that mark a breaking change.
- `NOTES_CHARS` sets how much of the release notes is quoted.
