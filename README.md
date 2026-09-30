# FileMagics daily feature monitor

An automated agent that tests every feature of **https://www.filemagics.com** every day at **6:00 AM IST** and publishes a report.

## What it checks (39 checks)

- **31 tools** are tested end to end. For each one it opens the tool page, uploads a real sample file, runs the conversion and downloads the result. It then checks that the output is a valid file of the expected type (PDF, DOCX, XLSX, PPTX, PNG, JPG, SVG, TXT).
- **8 site pages** (Home, Blog, About, Contact, FAQ, Privacy, Terms, Support) must load with HTTP 200 and real content.
- It records API response codes and times (`/proxyApi/...`), page load time and JavaScript errors. It saves a screenshot of every failure.
- A failed check is retried once before it counts as a failure, so brief network hiccups don't raise false alarms.
- *Edit PDF* is an interactive editor, so for that tool it only checks that the page loads and accepts an upload.

## Where the report goes

| Where | What |
|---|---|
| `https://<your-user>.github.io/<repo>/` | Latest HTML report with pass/fail per feature and a 14-day trend |
| `…/archive.html` | Every past daily report |
| GitHub **Issues** | When something breaks, an issue named "🔴 FileMagics: features failing" is opened and GitHub emails you. Each new failing run adds a comment, and the issue closes itself when all checks pass again. |
| Actions run page | Summary table plus a downloadable report for each run |
| Slack (optional) | A daily message, if you add a `SLACK_WEBHOOK_URL` secret |

## One-time setup (≈5 minutes)

1. Create a new GitHub repository (it can be private, but GitHub Pages on a private repo needs a paid plan).
2. Upload the contents of this folder to it, or push them with git:
   ```bash
   git init && git add . && git commit -m "FileMagics monitor"
   git branch -M main
   git remote add origin https://github.com/<you>/filemagics-monitor.git
   git push -u origin main
   ```
3. Go to **Actions → FileMagics daily check → Run workflow** to run it once now.
4. After that first run, go to **Settings → Pages**, choose *Deploy from a branch*, then `gh-pages` / `root`. The report is then live at `https://<you>.github.io/filemagics-monitor/`.
5. (Optional) **Settings → Secrets → Actions → New secret** `SLACK_WEBHOOK_URL` for Slack messages.
6. Make sure you are "watching" the repo (the default for the owner), so failure issues arrive by email.

From then on it runs every day on its own. To change the time, edit the `cron` line in `.github/workflows/daily-check.yml`. Cron times are in UTC, so 6:00 IST is `30 0 * * *`.

## Run it on your own computer

```bash
npm install
npx playwright install chromium
npm test                                 # all checks → report/index.html
ONLY=merge-pdf,pdf-to-text npm test      # just some tools
HEADED=1 ONLY=rotate-pdf npm test        # watch the browser do it
npm run selftest                         # offline test against a mock site
```

## Adding or adjusting a tool

All features are listed in `src/tools.js`. When the site adds a new tool, add one line:

```js
{ slug: 'new-tool', name: 'New Tool', group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'] },
```

If a tool needs an extra click before converting (a setting or page selection), add `prep: [{ click: /Button text/i }]`. If its main button has an unusual name, add `action: /button text/i`. Sample upload files live in `fixtures/`, and `npm run fixtures` regenerates them.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `https://www.filemagics.com` | Site to test (e.g. a staging URL) |
| `RETRIES` | `1` | Retries per failing tool |
| `TOOL_TIMEOUT_MS` | `120000` | Maximum wait for one conversion |
| `ONLY` | – | Comma-separated tool slugs to test |
| `FAIL_ON_ERROR` | `1` | Set to `0` so the process exits 0 even when checks fail |
