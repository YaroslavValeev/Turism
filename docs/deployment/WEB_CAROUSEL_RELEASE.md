# Guarded web carousel release

This operation publishes the accepted carousel from an immutable GitHub commit. It is separate from the UI PR and never runs API, admin or database builds, migrations, restore jobs or Telegram processes. Run the helper on the existing production host as root, with the canonical application directory and HTTPS origin supplied explicitly.

The accepted UI is merged in PR #165 at `56e7e5a5b85ca2a0bd1d5c74597dc90749c2ee8f`. Its approved helicopter asset SHA-256 is `af81e776f18e956dfe4f8806a75270561d852094cc4640183fed220242dcf25e`.

```bash
bash scripts/production/deploy-web-carousel.sh \
  --root /opt/mywave/tourism \
  --release 56e7e5a5b85ca2a0bd1d5c74597dc90749c2ee8f \
  --origin https://mywavetour.ru \
  --heli-sha af81e776f18e956dfe4f8806a75270561d852094cc4640183fed220242dcf25e
```

The server deployment directory does not need `.git`. The helper resolves its physical path and discovers the current Compose project from the existing web container. It refuses another application root, invalid or multiple service containers, non-HTTPS origins, unsafe archive entries, changed protected services/configuration, or an incorrect helicopter asset.

Before switching it checks API health and nginx syntax, creates a verified physical source/configuration archive, saves the old web image under an immutable rollback tag, and builds in a separate source directory from the pinned public GitHub archive. Only `NEXT_PUBLIC_*` values from the current web environment enter the build; private runtime variables remain out of the new image. The existing configured HTTPS npm registry is reused. Public values requiring complex dotenv quoting stop the operation instead of being silently rewritten.

The new image must start successfully with networking disabled, contain the approved image and compiled carousel, before the web container is replaced. The existing Compose configuration, environment files, ports, networks and media volume are reused through a private image override. The base Compose file and deployed application source are not overwritten. A later normal GitHub sync from main includes the merged carousel; the isolated release source remains in the backup directory for this deployment's provenance.

Only web is recreated (`--no-deps --no-build --pull never`). Nginx is tested and reloaded in its existing container to refresh the web upstream address; its configuration is not edited and the proxy container is not recreated. Verification checks the live asset hash, homepage JavaScript, active image identity, image release label, unchanged API release identity, protected container IDs and configuration hashes. Probe requests are GETs only.

On any failure after cutover, including explicit guard failures, the helper restores only the old web image and reloads nginx. It refuses to restore against a configuration/protected stack changed concurrently by another operation. The exact manual rollback command is printed and the helper/state are retained in a private root-owned backup directory. No database or environment restoration is performed.

`WEB_CAROUSEL_RELEASE_VERIFIED=<SHA>` means the image, static artifact, homepage bundle and stack guards passed; it does not assert that a real booking, notification, physical mobile device or every catalog interaction was tested.

Testing (local Linux/Docker, production is not contacted):

```bash
sudo bash scripts/production/deploy-web-carousel.test.sh
```

The contract tests cover successful web-only cutover, explicit manual rollback, isolated-image failure, protected-container drift before cutover, wrong live asset, old homepage bundle, changed API health identity and invalid input. They also verify a symlinked deployment root is backed up physically and that private runtime values are not baked into the image or logged.

Current preparation evidence is local/CI only. SSH attempts on 2026-10-11 timed out before authentication; no production deployment was performed from that preparation session. The operator-run helper performs fresh server preflight rather than assuming old deployment evidence is current.
