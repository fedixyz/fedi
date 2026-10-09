# The release notes site

Release reports are hosted at https://release-notes.apps.fedibtc.com, one page per version. The 26.9.3 report is at https://release-notes.apps.fedibtc.com/26.9.3/. The site is a Fedi App Kit app behind Fedi Google login. Every fedi.xyz account can read it, and nobody outside Fedi can. It is not part of the Fedi app's production, and a failed upload leaves the previous version of the site running. Its source is the private repo `fedibtc/release-notes`.

Never put a release report on surge.sh or any other public host.

## Upload a report

Upload only when the user asks for the report to be deployed, shared or linked. Rendering a report is not that ask.

1. Render and screenshot the report as Step 9 describes. Upload the renderer's output file itself, never a copy staged somewhere else, so the page that goes up is the page you checked.
2. Clone the repo once with `gh repo clone fedibtc/release-notes ~/fedibtc/release-notes`. The script pulls `main` on every run.
3. Run the upload as its own command, after those checks:

   ```bash
   ~/fedibtc/release-notes/scripts/upload.sh <version> <out.html> [<extra files>]
   ```

   `<version>` is the full version the report describes, `26.10.0` for a feature release or `26.9.3` for a patch. Extra files, such as the PDF, are copied next to the page.

   The script needs `DEPLOY_BROKER_TOKEN`, a token from https://deploy.apps.fedibtc.com/tokens. The site accepts uploads from its owner and from App Kit deploy admins. Anyone else hands the file to one of them.

   The script prints the file it took with its title and modification time. It copies the file to `site/<version>/index.html`, rebuilds the index page, commits and pushes, deploys, and prints the page URL. Uploading the same version again replaces its page.
4. Read the printed title and time, and confirm they belong to the render you checked. Then link `https://release-notes.apps.fedibtc.com/<version>/` where the report is referenced. `release-notes-copy.md` sets out the GitHub release body.
