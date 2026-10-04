# Getting a first run out of it

You have imported the sheet and both workflows. This is what is still missing, in order.
About fifteen minutes.

## 1. Fill in five settings

Open the **`config`** node in `01 capture and reply`:

| Setting | What to put | Why it matters now |
|---|---|---|
| `TRACKER_SHEET_ID` | the long code in the sheet's address, between `/d/` and `/edit` | without it, nothing can be written |
| `REPLY_TO` | your address | goes on the Reply-To header of the customer email |
| `TEST_EMAIL` | **your address** | this is what makes emails actually send, to you |
| `AREAS` → the `SW` entry's `email` | **your address** | otherwise the owner email is skipped and you only see half the flow |
| `DIGEST_TO` | your address | needed for workflow 2 |

Leave `TEST_RUN = true`. With `TEST_EMAIL` filled it is in **test** mode: emails really
send, but every one comes to you, subject-prefixed `[TEST -> the.real@address]`.

Then **copy the whole config node and paste it into the same node in `02`.** The two must
match, `validate.py` checks this, and workflow 2 reads the same sheet.

## 2. Attach credentials

Six nodes, two credential types. n8n will show a red triangle on each until you do.

| Workflow | Node | Credential |
|---|---|---|
| 01 | `[cred] Sheets - log the enquiry` | Google Sheets OAuth2 |
| 01 | `[cred] Gmail - reply to the customer` | Gmail OAuth2 |
| 01 | `[cred] Gmail - tell the owner` | Gmail OAuth2 |
| 02 | `[cred] Sheets - read the tracker` | the same Sheets credential |
| 02 | `[cred] Gmail - nudge the owner` | the same Gmail credential |
| 02 | `[cred] Sheets - record the chase` | the same Sheets credential |
| 02 | `[cred] Gmail - send the digest` | the same Gmail credential |

Create each credential once; pick it from the dropdown on the rest.

## 3. Run workflow 1

The webhook has two URLs. **Test** listens for a single call and only while you are
watching; **Production** works whenever the workflow is Active.

```
https://<your-n8n>/webhook-test/cleaning-enquiry     ← use this first
https://<your-n8n>/webhook/cleaning-enquiry          ← once it is Active
```

1. Open workflow 1, click **Test workflow**. It is now listening.
2. Run [`sample/test-post.ps1`](sample/test-post.ps1) (PowerShell) or
   [`sample/test-post.sh`](sample/test-post.sh), with the URL swapped for yours.

**What should happen:**

| Where | What you should see |
|---|---|
| the terminal | `{"ok":true,"ref":"CE-20260831-…"}` |
| the canvas | green ticks all the way to `Reply to the website` |
| the sheet | one new row, Stage `Questions sent`, Owner `Priya`, Area `South` |
| your inbox | **two** emails. The customer reply with three questions, and the owner note |

Both subjects start `[TEST -> …]`. That prefix is your proof the redirect is working and
nothing reached a real address.

Then try [`sample/spam.json`](sample/spam.json) as the body: it should stop at
**STOP: spam or incomplete**, write no row, and send nothing.

## 4. Run workflow 2

The chaser needs something old to find, and your fresh test row is minutes old, so seed one.

1. Open [`sample/seed-row.csv`](sample/seed-row.csv), replace `YOUR-EMAIL@example.com`
   with your address, and paste the second row into the Enquiries tab under your test row.
   Its **Last touch** is already three days back.
2. Open workflow 2 and click **Test workflow**.

**What should happen:**

| Where | What you should see |
|---|---|
| the canvas | both branches run. The chase side and the digest side |
| your inbox | a nudge naming `Seeded Test Ltd`, and the morning digest |
| the digest | counts by stage, and `Seeded Test Ltd` under **Gone quiet** |
| the sheet | `Chases sent` on the seed row is now `1`, and Notes has a dated line |

Run it a second time and the seed row should **not** be chased again, one chase, then it
waits another 48 hours. Run it a third and fourth time and it stops at `CHASE_MAX`.

## 5. Go live

1. `TEST_RUN = false` in both configs.
2. Set the real owner emails in `AREAS`.
3. Activate both workflows.
4. Give the **Production** webhook URL to the contact form plugin.
5. Delete the test rows from the sheet.

## If something does not work

| Symptom | Cause |
|---|---|
| `404` from the webhook | using the Test URL without clicking **Test workflow** first, or the Production URL while the workflow is inactive |
| Row written, no emails | `TEST_EMAIL` is blank, so it is in preview mode. That is the shipped default. |
| Only one email arrives | the `SW` area has no `email` set, so it stopped at **STOP: no owner email set** |
| `The caller does not have permission` | the Google account behind the credential cannot open that sheet |
| Owner is `Office`, area `Unassigned` | the postcode did not match any prefix in `AREAS` |
| Nothing chased in workflow 2 | every row was touched inside 48 hours, or `Chases sent` is already at `CHASE_MAX` |
| Chase fires every single run | `Chases sent` is not being written, check the match column on `[cred] Sheets - record the chase` is `Ref` |
