# Changelog

Every published version of Attestkeep, newest first. The same notes with
install commands are at [docs.attestkeep.com/releases](https://docs.attestkeep.com/releases/).

Entries are labelled **Fixed**, **Added** and **Changed** so that the question
an operator actually arrives with — is there something here I need to act on —
is answered without reading the prose. Anything that requires action says so in
its first sentence.

Each release is one image digest pushed to GHCR and signed twice on that
digest — keyless through GitHub's OIDC, and against `cosign.pub` for clusters
that cannot reach the transparency log. Verify the digest, not the tag.

```sh
curl -sO https://docs.attestkeep.com/cosign.pub
cosign verify --key cosign.pub ghcr.io/attestkeep/attestkeep-k8s:1.4.0
```

## 1.4.0 — 2026-10-28

**Changed — upgrading applies migrations 0036 to 0046 on first start, and they move forward only: a return to 1.3.7 is a restore from backup, not a `helm rollback`.** Each migration that alters an existing table waits at most five seconds for its lock (`lock_timeout`); past that it fails, the replica restarts and tries again, so admission is held for at most five seconds instead of behind the slowest open read. 0036 to 0040 add the deny list and its hits, the package list and the stored unfixed findings, image index relations, the What-if run type, and the deny-list and workload columns on the admission ledger. 0041 adds the SIEM destinations, their read positions, their status and the record of what was given up; 0042 records when each finding was first seen, seeded from the findings present at upgrade. 0043 adds the take-down record and columns on the deny-list hits; existing hits count as already notified. 0044 to 0046 add the executable entries, their answers per entry and image, the stored list of an image's executables, the check's work queue and the evidence a hit of an executable entry keeps. Nothing existing is removed.

**Changed — SIEM export needs PostgreSQL 13 or later if you run an external database.** It reads in commit order with `pg_current_snapshot()`; the chart-managed PostgreSQL (16) already is. On an older server SIEM destinations cannot be switched on and the page says why; everything else runs as before.

**Changed — new chart values, all optional; set `rbac.denyList.takedown: true` if administrators are to take down running workloads.** `rbac.denyList.takedown` (default `false`) grants pod eviction and get/update on the scale subresource of Deployments, StatefulSets and ReplicaSets; without it the take-down button is disabled and the API answers `409`. `binscanLimits` (the executable check's caps), `scan.binscanTimeout` (`10m`, one check's deadline), `scan.tmpSizeLimit` (`4Gi`, the scanner's `/tmp`), `scan.binscanDiskBudget` (empty: `scan.tmpSizeLimit` shared by the workers, less 256 MiB) and `denyListWhatIfLimits` (the deny-list What if's read bounds) keep their built-in values when left empty; `defaultPolicy.denyList` (`enforce`) sets the seeded policy's deny-list mode; `webhook.preStopSleepSeconds` (`5`) is how long a stopping replica waits to leave the Service before it closes its listener. The chart now grants `get` and `list` on Deployments, ReplicaSets, StatefulSets, DaemonSets, Jobs and CronJobs in every installation, so pods are counted against the workload that owns them, and `get`, `update` and `patch` on `imagesecuritypolicies/status`, where the `SignatureKeysValid` condition is written; both arrive with `helm upgrade`. `helm upgrade --reuse-values` works across this version: a value 1.3.7 did not have is read with its default. See [Configuration](https://docs.attestkeep.com/configuration/).

**Changed — a deny-list refusal does not send Admission blocked; tick Deny list hit on an existing channel to be told of one.** New channels are subscribed to **Deny list hit**; channels created before 1.4.0 keep the subscriptions they had. A refusal is told once per entry and workload, then in one digest a day per entry; Admission blocked is for refusals by a policy's own rules.

**Changed — one key now signs for the licence and for evidence; an offline installation activated before 1.4.0 needs a new activation request before signed evidence downloads work, and the Secret `attestkeep-evidence-key` belongs in your backup.** The installation's evidence signing key, in the Secret `attestkeep-evidence-key`, is also its licence identity: online activation, the daily check, the offline activation request and the key the certificate names are all that one key, and no second key pair is kept in the database. An online installation activated before 1.4.0 goes on signing its daily check with the pair it was activated with and moves to the one key at its next activation; nothing changes for it before then. An offline installation keeps its licence, but its certificate names the old pair, so a signed evidence download is refused until a new activation request from Usage and License is exchanged for a new certificate; the Evidence page and the refusal say so. Losing the Secret now also loses the licence identity: the next daily check is answered `401` and the cluster falls to Community until it is activated again. See [Backup](https://docs.attestkeep.com/backup/).

**Changed — the daily licence check runs on one operator replica; the scanner no longer contacts the licence server.** Before 1.4.0 the scanner made the daily check as well, so it also opened connections to lic.attestkeep.com, and where egress rules let only the operator reach the licence server its log showed `licence check could not reach the server; will retry`.

**Fixed — with the database unreachable or hanging, operator replicas left the Service and admission answers were lost; if you watched operator readiness to detect a database outage, watch `attestkeep_database_up` instead.** A replica now stays ready while the database is unreachable — readiness asks that the server answers and its certificate is loaded — so the webhook keeps refusing by the static rules (`:latest`, the registry allow-list, a required digest) instead of being skipped. An admission review gives its database work two seconds in all; after that the static rules decide at once, recording and cache-dependent verdicts degrade, and the outage is logged once (a `:latest` pod used to wait 14 seconds, past the API server's webhook timeout). Notifications go out off the request, at most 64 waiting, the rest dropped and counted (`attestkeep_notifications_dropped_total`). The database is reported in `attestkeep_database_up` and on the health page.

**Fixed — a rolling upgrade or a scale-down could lose admission reviews in flight; upgrading from 1.3.7 or earlier, run the upgrade with `--set webhook.failurePolicy=Fail` and set it back after.** A 1.3.7 replica stops the old way, without draining: for about a second, while the cluster stops routing to it, a request the API server sends it is admitted under `failurePolicy: Ignore`; with `Fail` it is refused instead. Upgrading during a change freeze closes that window too. From 1.4.0 on every upgrade drains, with nothing to set. A stopping replica now leaves the Service before it stops answering: its preStop hook waits `webhook.preStopSleepSeconds` (default `5`) while the cluster stops routing to it, then the process keeps its listener open five seconds more and finishes the reviews in flight. The pod's termination grace period is that value plus 30 seconds.

**Fixed — server-side dry runs (`kubectl apply --dry-run=server`) were recorded as admissions.** A dry run is still decided and answered as a real request would be, but leaves nothing behind: no ledger row, deny-list hit, Kubernetes event, notification or metric, no count against the image allowance, and nothing queued for a scan. Dry runs recorded before 1.4.0 stay in the ledger and in the evidence packages of those periods.

**Fixed — a mail server or webhook that accepted the connection and never answered held the send open with no limit.** Every send (mail, webhook, Slack, Teams) now has 30 seconds from connect to the last byte, and one that runs out is recorded in the notification log as undelivered with "no answer within 30s". At most 64 sends run at once and at most 64 notifications wait; beyond that a notification is dropped, recorded as undelivered and counted in `attestkeep_notifications_dropped_total`.

**Fixed — the forced password change accepted the temporary password, and its route could change any account's password without the current one.** The new password must differ from the temporary one (and, on Profile, from the current one) and pass the same rule as everywhere else; once changed, the temporary password no longer signs in, and the session it opened is replaced. The route now answers only an account whose temporary password is still to be replaced; every other account changes its password on Profile, which asks for the current one. The audit row names the user who changed the password, where it read "anonymous".

**Added — `license.caBundle`: a private CA for the licence server.** PEM certificates the operator's licence client trusts beside the system roots, for a TLS-intercepting proxy on the route to `license.serverUrl` or a licence server under a private CA; set it with `--set-file license.caBundle=ca.pem`. Certificate verification stays on.

**Added — key-based image signature verification: `signatureKeys` on a policy.** It lists PEM public keys (`cosign.pub`); with `requireSignature`, only a signature one of them verifies is accepted. The scan records the signer as the key's fingerprint (`key sha256:…`), which the evidence package names. With `scan.cosignOffline` the check needs no transparency log. Attestations stay keyless: SBOM and vulnerability attestations have no key field. The API server refuses an entry that is not shaped as a PEM public key; one that still does not parse is ignored and named in the policy's status condition (`SignatureKeysValid`), a Warning event and the policies page.

**Fixed — a break-glass window scoped to named images covered every image the policy governs.** 1.3.7 and earlier did not store `affectedImages` when break-glass was opened, so the bypass applied to everything. It is stored now, and admission, the runtime reconciliation sweep and the `kubectl` plugin's `scan` all read it the same way: by image name, so `nginx`, `docker.io/library/nginx` and `nginx:1.27` all name one image and a tag in the list does not narrow it. Under `runtimeReconciliation: enforce`, an unscoped bypass still steps the sweep down to notify; a scoped one leaves only those images' pods running. An empty list still covers every image.

**Fixed — a runtime policy's Stop the pod did not honour `rbac.allowEnforce` when take down was granted.** With `rbac.denyList.takedown: true` the ClusterRole carries pod eviction for take down, and a runtime policy used it to stop a pod while `rbac.allowEnforce` was false. A runtime stop now needs `rbac.allowEnforce: true` whatever else the ClusterRole grants: without it the stop is refused before the API server is asked, the audit log records "not stopped: the chart has not granted pod eviction (set rbac.allowEnforce)", and the alert says the pod is still running. The `runtimeReconciliation: enforce` sweep follows the same rule. Take down keeps its own grant.

**Fixed — a licence server certificate error was reported as an invalid key.** An activation that cannot reach the licence server — its certificate not trusted (a private CA without `license.caBundle`), the connection refused or timed out, the name not resolved — no longer reads "That license key could not be validated." The API answers `502` with the server and the cause, the console says the licence server could not be reached and names `license.caBundle`, and the operator logs a warning with the server and the error. A `5xx` answer from the licence server is reported the same way as a server error, with `503` and "The licence server answered with an error. Try again later." The key is never part of the message.

**Added — a deny list: refuse an image because somebody decided it must not run.** One list per cluster, in Security › Deny list. An entry names an image digest, an advisory id, a package with a version range (`maven org.apache.logging.log4j:log4j-core < 2.17.1`), an executable's hash or an executable's path, and needs a reason. It is checked before break-glass and before every policy rule: a listed image is refused even when its scan is clean and even while break-glass is open, with the reason `denied by deny list entry <id>: <entry>`. Entries are never deleted; removing one asks for a reason and keeps the row with who removed it and when. Adding and removing are administrator actions, recorded in the Audit Log as `deny_list_add` and `deny_list_remove` with the entry and the reason. An empty list refuses nothing, so the upgrade changes no decision until an entry is added. See [Deny list](https://docs.attestkeep.com/deny-list/).

**Added — `denyList` on every policy: `enforce`, `audit` or `"off"`.** `enforce`, the default and what an absent field reads as, refuses a listed image even under a policy whose enforcement is `Audit`. `audit` admits it with a warning and records the hit; `off` does not consult the list. The policy form has the field; manifest export and import carry it. Write `off` quoted in YAML. After the upgrade each policy records one new revision, because the field is part of the content the ledger hashes.

**Added — What if for a deny-list entry, before it is added or from its row.** It lists the running workloads the entry covers, read from the cluster at that moment and grouped by the pod's owner (on a large cluster the read stops after 20 seconds, 20,000 pods or 2,000 distinct images and says it is partial), and the admissions of the last 30 days (up to 90) it would have refused, those let in under break-glass included, since break-glass never passes the deny list. Nothing is stopped and nothing is saved. A deployer's or an administrator's run is kept in What-if history (at most 500 deny-list runs, counted apart from the 500 policy runs), which now has a type column (policy | deny list) and a type filter; it downloads as PDF or JSON as a projection, not evidence. An entry with `>` or `>=` is marked as also covering every future version.

**Added — Add to deny list from the Images and Vulnerabilities pages.** The image detail offers the digest, and reads "Listed" for a digest already on the list; a vulnerability row offers the advisory id, and its package and installed version for a package entry. The Images list badges a row whose verdict is a deny-list refusal "Deny list #N", with the refusal on hover.

**Added — hits: what each entry caught.** Every refusal or audit warning an entry causes is counted against the workload — one row per entry, namespace, workload and digest, with first and last seen and a count — and the admission ledger row names the entry. A Deployment's pods are counted against the Deployment and a CronJob's against the CronJob, so a rollout does not start a new row. The deny-list page shows the latest hits of all entries; each entry's hits can be filtered by namespace and workload.

**Added — affected workloads and take down, by hand, once.** **Affected** on an entry lists, live from the cluster, the workloads it catches and the ones it refused, with a status: running, pods down (recreated pods refused), scaled to zero, or restored externally, and counts of the images matched, not matched, not checked and with no answer yet (one image can run in several workloads); a running image nothing has checked and nothing is queued for is not checked (no check yet), and no answer yet is one whose check is queued or whose scan failed. With `rbac.denyList.takedown: true` an administrator can take one down, with a reason: **Delete pods** (the default) evicts its pods once and leaves the desired state alone; **Scale to zero** (Deployment, StatefulSet, ReplicaSet) keeps the previous count, and **Restore** puts it back. Each take down is recorded before the cluster is touched and its outcome after. Nothing is ever taken down automatically and nothing is repeated: PodDisruptionBudgets are honoured (a blocked take down reads "Blocked by PodDisruptionBudget" with the number of pods it kept), a workload marked as managed by Argo CD or Flux is warned about, and when such a tool puts it back the row reads "restored externally" and is left alone. Every take down and restore is in the audit log (`deny_list_takedown`, `deny_list_restore`).

**Added — deny-list notifications and Kubernetes events.** **Deny list hit**: the first time an entry catches a workload, with the entry, its reason and the way out, then one digest a day per entry; the sentence about recreated pods follows the namespace's `denyList` mode. **Deny list entry added** and **removed** can be subscribed to (off by default). A refusal leaves a `Warning` event, reason `DenyListRefused`, on the workload (on the namespace for a pod nobody owns), at most one per workload and entry every five minutes. A refused image's ImageSecurityReport carries `status.denyList` with the entry and the refusal.

**Added — version comparison per ecosystem for package entries.** Versions are compared with the comparator the scanner uses for that ecosystem: npm, Go, Cargo, Composer, NuGet, Maven, PyPI, RubyGems, deb, apk and rpm, every operator in every one. A version the comparator cannot read is refused when the entry is added. The comparators are vendored at the versions Trivy 0.76.1 pins; two of them (`hashicorp/go-multierror`, `hashicorp/errwrap`) are MPL-2.0, unmodified, as THIRD-PARTY-NOTICES.md states.

**Added — advisory ids beyond CVE.** An advisory entry accepts the schemes scanners report findings under — CVE, GHSA, GO, PYSEC, RUSTSEC, OSV, MAL, GSD, DLA, DSA, ELA, USN, RHSA, RHBA, ALSA, ALBA, ELSA, CGA, BIT, TEMP, SUSE-SU, openSUSE-SU — because for some findings that id is the only name they carry. Anything else is refused with `400` naming the field. Ids are stored upper-case, a GHSA id as GitHub prints it (`GHSA-jfh8-c2jp-5v3q`), and matched case-insensitively; the executable check's answers and the deny-list hits name a GHSA id the same way.

**Added — deny-list entries for executables.** Two new kinds: **Executable hash** (`binary`, the sha256 of a file, matched in any image under any name) and **Executable path** (`binary_path`, a path such as `/bin/sh` or `/usr/local/bin/*`, or a file name such as `nc` anywhere; the names links give a file count too, so `/bin/sh` on Debian 12 is `/usr/bin/dash`). A path rule also hits base images; the form and the docs say to start it where the policy has `denyList: audit`. A new package ecosystem, **bitnami**, names a runtime and its upstream version as read out of the executable itself — `package bitnami php < 8.2.35` — and never matches a distribution package. The products are php, node, python, ruby, nginx, apache, postgresql, curl and openssl; another is refused when the entry is added. A source-built PHP in an image without any label or package record is caught: Trivy lists no php for it, the check reads 8.2.12 out of `/usr/local/bin/php`, a stripped build included.

**Added — the executable check, `attestkeep-binscan`.** A second tool in the operator image, run by the scanner the way Trivy is, and only when an entry it answers is on the list — an executable hash or path, a `bitnami` package, or an advisory id: with none, it never runs and no image is pulled a second time. It reads only the files' bytes — never the image's name, labels or environment — hashes every ELF file, and reads product versions from their read-only sections. Every answer is one of three: matched (with the file, its hash, the version and the signature), not matched, or not checked with its reason (credentials, registry, image gone, limit, tool error, no source; in Affected and What if also no check yet: no check has run for this image yet and none is queued) — never counted as clean. A pod whose image has no answer yet for an executable or `bitnami` entry is decided as an unscanned image is (`DenyUntilScanned` refuses, `AllowAndScan` admits with a warning). An advisory entry does not wait for the check: a missing answer never refuses, Trivy's findings decide at once as before, and a match the check finds later only adds to them. Caps: an ELF file over 256 MiB is hashed but not read for versions, at most 4,000 ELF files per image, 60 s per walk (`binscanLimits`); a check has its own deadline (`scan.binscanTimeout`), and an image whose layers exceed the check's disk budget (`scan.binscanDiskBudget`) is not downloaded. An answer stopped by a cap or the deadline reads "not checked (limit)" and names it. An administrator can **Check again** an image that could not be checked (audit log `deny_list_check_again`). The Images page shows a digest's answers under **Deny list checks**, the health page has a line of its own, and the Images drawer shows the SBOM a level-2 advisory match rests on.

**Added — advisory ids reach source-built runtimes.** With an advisory entry on the list, the runtimes the check finds are matched against the Bitnami vulnerability ranges in the Trivy database the operator already keeps: `cve CVE-2026-109618` catches a source-built PHP 8.2.12 or 8.3.0 and not 8.2.35. A runtime those ranges do not cover (curl, openssl) is "no vulnerability data in this source", never "not matched". The ranges are the Bitnami Vulnerability Database's (Apache License 2.0).

**Added — SIEM export: security events to your SIEM, as they happen.** Settings › SIEM export sends refused admissions, deny-list hits, changes and take downs, runtime events, policy, break-glass and triage changes, evidence generation and downloads, failed sign-ins, role changes, critical findings once, by the scan that first reported them, and known-exploited ones once, by the scan that first saw them on the KEV list, as `attestkeep.event/v1` JSON. Five destinations: generic HTTP (JSON array or one event per line, optional gzip, two request headers, optional HMAC signature `X-Attestkeep-Signature`), Splunk HEC, syslog over TLS or plain TCP with a CEF, LEEF or JSON body, Elasticsearch's bulk API, and Microsoft Sentinel's Logs Ingestion API. Each destination filters by event type, namespace and lowest severity, and a new one can start with the last 24 hours. Credentials are encrypted with the data key and never shown again, and are removed when a destination's address changes; loopback and link-local destinations are refused. **Test** sends one event and shows the answer. Administrators add, change, test and remove destinations, recorded as `siem_target_add`, `siem_target_update`, `siem_target_test` and `siem_target_remove`. See [SIEM export](https://docs.attestkeep.com/siem/).

**Added — SIEM delivery you can count on and count.** Events are sent at least once over HTTP (best effort over syslog, which has no receipt), in commit order, every few seconds, at most 100 per request, from the replica running the periodic work; each carries a `reference` to drop repeats by. A destination that fails is retried with growing waits, or after its `Retry-After`, and never holds back another; one held behind an open database transaction reads **Waiting**. An event still undelivered 24 hours after it happened is given up and shown as "N events not delivered". Metrics `attestkeep_siem_events_total{target,outcome}` and `attestkeep_siem_lag_seconds{target}`. The configuration bundle carries SIEM destinations without credentials, they import disabled, and the import note names every field the bundle did not carry; Settings › Backup counts them.

**Added — evidence sections 13 and 14.** External export lists the SIEM destinations, the last batch each accepted, and the events given up in the period (`external_export` in `report.json`). Deny list lists the entries in force and the ones added or removed in the period (who, when, why), the admissions they refused and let in, the exceptions, every take down and restore, and for an executable entry the file, its hash and the version (`deny_list` in `report.json`).

**Changed — the scanner keeps every image's package list.** Trivy now always runs with its full package listing, and the list is stored with the scan, which is what package entries are matched against. Images scanned before 1.4.0 are rescanned in the background to fill it in, a few at a time and only while the scan queue is short; an image whose rescan fails three times is left out and logged.

**Changed — findings without a fix are stored, apart from the findings list.** With `include_unfixed` off, those findings were dropped; they are now kept in their own table so an advisory entry can match them. Every page and report that reads findings sees exactly what it saw before.

**Changed — Images: the Pods column is "Admitted pods".** It counts the pods admitted with the image since it was first seen and does not go down when a pod stops; the column says so.

**Changed — Go 1.26.10, Trivy 0.76.1, cosign 3.1.4.** The operator is built with Go 1.26.10, which carries the crypto/x509 mitigation that distrusts a small set of compromised intermediate certificates (CVE-2026-111943, GO-2026-6809). The bundled Trivy 0.76.1 is the release whose notes name the eMudhra intermediate CA key compromise; its binary is built with Go 1.27.3, which carries the same mitigation. cosign 3.1.4 now comes from the cosign project's release binary, checked against its published checksum, and that binary is built with Go 1.27.3 as well.

**Fixed — saving a policy from the console dropped the parts of it the form does not edit.** A save rewrote the whole resource, so the record of a closed break-glass window (approver, reason, scope) — and an open one — disappeared, and a block written at its default with `kubectl`, such as `workloadHardening: {mode: off}`, was removed. An update now keeps the break-glass block as it is and keeps any block the save leaves out when it changes nothing; a field the save actually changes is written as before.

**Fixed — `workloadHardening.mode: off` was stored as `false`.** The CRD listed the enum values unquoted and YAML 1.1 reads a bare `off` as a boolean, so a manifest setting it by hand was refused. The enum values are quoted strings now, as is the new `denyList` enum. The fix is in the CRD, which `helm upgrade` applies.

**Fixed — a rescan that failed was queued again every 30 seconds**, and the health line counted every failed job. A digest whose scan the queue gave up on (three attempts) is tried again once the rescan interval has passed; the health line counts an image once, and not at all once a later scan of it ran.

**Fixed — the dashboard's Severity trend.** It counts the open findings of every image held, the Vulnerabilities page's rows, and its title is the sum of the four bands below it; a day with no scan no longer reads zero.

**Fixed — the dashboard's Leader** is the replica holding the controller lock, not the one that answered.

**Changed — the dashboard's compliance figures are the Images page's four states.** The tile, its chips and the distribution count Blocked, Unscanned, Compliant and Not compliant by the rule the Images page tiles use, so the two pages give the same numbers: an image whose last admission was refused is Blocked even when its scan is within the policy, and one admitted under break-glass counts as Not compliant. The distribution's Break-glass and Unknown slices are gone. On the Images page each row's Compliance chip names its state in the same words and the filters select by it; the scan's verdict is in the image detail.

**Fixed — the Vulnerabilities title** counts every CVE the filters select, the pager's total, not the page's 25, and the findings and images beside it are counted under the same filters.

**Fixed — an image pulled by two references was counted twice on the Vulnerabilities page.** The same digest run by its tag and by its digest was listed twice under each CVE, and its findings counted twice in the title, the counts above the list and the triage dialog. A finding belongs to one image, its digest: it counts once, and the image is listed once, with every reference it was pulled by.

**Changed — evidence packages count a digest's findings once, and list each critical finding once with every reference it was pulled by.** A digest run by its tag and by its digest had its findings counted once per reference in `coverage.severity` and `coverage.findings_total`, and its critical findings listed once per reference; a package generated now for the same cluster reads lower by those duplicates. A `findings.critical` row names the `digest` and its `references` where it named an `image`.

**Fixed — a full image band read "Expired"** on the licence card; it reads "Allowance reached", with the licence's own dates. The allowance mail says new image names are denied at admission, not that they are no longer scanned.

**Changed — an image name refused for the monthly allowance is no longer counted toward it.** It was counted past the limit, so Usage read "11 of 8" and the dashboard "Over quota by 3" with three names refused; the meter now stops at the limit ("8 of 8", Allowance reached). The refusal and its admission record are unchanged. `status.quotaExceeded` on the ImageSecurityUsage resource and the evidence package's `coverage.quota_exceeded` keep their names and now mean the allowance is reached (the count is at or above the limit), not that names were refused past it.

**Fixed — single sign-on with a disabled account (or any sign-in that cannot complete)** lands on the sign-in page with the reason, not on raw JSON.

**Fixed — Settings › SMTP accepted a host with spaces, a port above 65535 and a sender that is not an address**, and the profile accepted a name of spaces or no name. Both answer `400` naming the field.

**Fixed — tables cut off at 1366 pixels.** The Vulnerabilities actions and the Images Rescan button stay on screen, and the dashboard's admission table fits its card, with a long reason on two lines and the whole sentence on hover. The Images header Admitted pods wraps onto two lines instead of running into Compliance.

**Fixed — console.** The Create User dialog no longer states a password length; the edition and version are shown once the operator has answered, not before; a refused evidence download shows the operator's reason; the first-run account screen no longer tells a person who just activated a licence to activate it afterwards; counts read "1 pod" and "1 replica", not "1 pods".

**Fixed — Turkish:** the menu, labels and help pages keep image, policy, node, admission, framework, compliance, Vulnerabilities and the edition names (Community Edition, Enterprise Edition) as the glossary says; an organisation's own written policy on the Organisation page reads Bildirim politikası and Saklama politikası, while the product's policy stays policy.

**Fixed — the kubectl plugin.** `usage` reads "unlimited" on a licence with no ceiling, and its plan, and names `kubectl image-security` when it runs as the plugin; `--help` no longer describes an install through krew. `evidence`'s help said records were timestamped through Rekor and listed a `list` subcommand that only errored; it now says what it exports (the evidence chain the reports carry, unsigned, with a checksum) and `list` is gone. `evidence generate` finds the reports of a tag through its digest and includes the entries recorded on the `--end` day. `evidence generate --format csv` writes CSV, a header and one row per evidence entry with the bundle's details on stderr, where it printed a table. `policy list` and `policy get` show a break-glass window past its expiry as `expired <time>`, not ACTIVE. The break-glass help says what break-glass does: the images it covers are admitted without the policy's image rules (the registry allow-list, the :latest and digest-pinning rules, the scan result and its rules, signatures, attestations and build provenance, the image quota and the node ceiling), and the deny list and workload hardening still apply; the approver is a ticket or role. The console's break-glass dialog and messages say the same.

```sh
helm upgrade attestkeep oci://ghcr.io/attestkeep/charts/attestkeep \
  --version 1.4.0 \
  --namespace attestkeep --wait
```

## 1.3.7 — 2026-10-15

**Fixed — the operator is now built with Go 1.26.9 and `golang.org/x/net` 0.60.0.** Both close published vulnerabilities in HTTP/2, HTTP/1, TLS and HTML template code that the operator reaches, among them a crash of the HTTP/2 server. 1.3.6 and earlier carry `golang.org/x/net` 0.58.0; upgrade to take the fixed versions.

**Fixed — a container added to a running pod with `kubectl debug` was never sent to the admission webhook, whatever image it ran.** The webhook now also receives the `pods/ephemeralcontainers` subresource. Only the container being added is decided: its image is scanned and held to the policy, and an enforcing policy refuses it like any other image. The pod's existing containers are not reviewed again. A debug image is not counted against the monthly image allowance or the node ceiling, and its ledger row's reason ends in `; subresource ephemeralcontainers`. If your team uses `kubectl debug` with images the policy does not allow, those requests are refused from this version on. The rule is part of the chart, so it takes effect through `helm upgrade`; replacing the image alone does not add it.

**Fixed — the Images tiles added up to more than the list.** An image refused at admission and never scanned was counted under both Blocked and Unscanned. Each image is now in exactly one state, and the first that applies wins: Blocked (its last admission review was refused), Unscanned, Compliant, Not compliant. Not compliant is a new tile: admitted and scanned but outside the policy, typically under an audit-mode policy or a break-glass window. The dashboard's Compliant and Blocked figures follow the same rule, so the two pages agree. An unknown `filter=` on `GET /api/v1/images` is now answered with `400` naming the four states.

**Fixed — the Images page's Last scanned read "just now" for a scan up to an hour old, and was English in the Turkish console.** It now counts minutes under an hour, then hours, then days, in the console's language, as the dashboard's Last checked does.

**Fixed — an image admitted under an audit-mode policy before its first scan, and found to carry criticals afterwards, was shown as Blocked although no review had refused it.** Blocked now follows the last admission review, not the verdict the scanner reaches later. Such an image is Not compliant, and its detail reads "Admitted; the next admission would be denied". The last review is filled in from the ledger on upgrade for images recorded with a digest; an image recorded by tag only takes it at its next review.

**Added — What-if replays are kept, listed and downloadable.** A replay run by a deployer or an administrator is stored for ninety days, at most five hundred runs, and listed under Security › What-if history, filtered by policy and period. Each run can be viewed again, downloaded as PDF or JSON, or, by an administrator, opened in the editor with Apply this draft, which loads the stored draft and applies nothing. The download is a projection, not evidence: the PDF says so on every page, is neither signed nor sealed, and a run never enters an evidence package. Downloads are recorded in the Audit Log as `policy_whatif_download`. A viewer can still replay; the answer is shown and not kept. See [Try a policy before enforcing it](https://docs.attestkeep.com/policies-whatif/).

**Added — What if on every row of the policies list.** An audit-mode policy is replayed as if it were enforcing, an enforcing policy as it stands, over the last thirty days, with the result open in the editor. Nothing is applied.

**Added — Scan now for the images a replay found unscanned.** The What-if result names the images in the period that have no scan record. Deployers and administrators can queue scans for exactly those digests (`POST /api/v1/images/scan`, at most 500 per request, recorded in the Audit Log as `rescan`). The replay is not re-run on its own; press What if again once the scans have finished.

**Added — the policy editor asks before Cancel discards unsaved changes.**

**Changed — `POST /api/v1/policies/whatif` takes an optional `source`, the policy the draft was edited from (an unknown name is `400`), and answers with `kept`, `run_id`, `unscanned`, `unscanned_total` and `notes`.** One account may start at most ten replays a minute on each operator replica; the next is answered with `429` and `Retry-After`.

**Changed — Apply to cluster is shown in the policy editor only to accounts that may write policies.** Everyone else keeps the What-if result, Download and Copy for git.

**Changed — framework names in the evidence list and in compliance reports come from one list**, so the two always name a framework the same way.

**Changed — upgrading applies migrations 0033 to 0035 on first start, and they move forward only.** 0033 adds the table that keeps What-if runs, 0034 adds two columns to the images table, 0035 fills them from the ledger. A return to 1.3.6 is a restore from backup, not a `helm rollback`. No new chart values; `helm upgrade --reuse-values` works across this version.

## 1.3.6 — 2026-10-08

**Fixed — the Images page counted a refused admission as a running pod.** An image that was never admitted showed `PODS 1` once the controller had retried it. The count now takes only admitted pods. Images refused before this version keep the count they had; it corrects itself as pods are admitted.

**Fixed — Falco events from a Stop the pod policy could not be filtered.** The Events action filter now offers the five effects a policy can have: Allow, Record, Notify, Open an issue, Stop the pod. The events API takes the same words as `effect=`.

**Fixed — the sidebar clipped its lower groups.** On a 1366×768 or 1600×900 screen with Settings expanded, the Compliance group could end up below the bottom of the sidebar. The sidebar scrolls as one and keeps the active page in view.

**Fixed — the evidence list ran off the page at 1366 and 1600 px and hid its action buttons.** Generated by and Recipient moved under the time and delivery cells, the report id folds at its hyphens, and the buttons now read Sign and download and Mark delivered.

**Fixed — the usage gauge drew the limit label across its own tick, so `100 limit` read as struck through.**

**Fixed — the console's package view broke words such as `uretim-durdur` and `busybox:1.36` in the runtime section.** The view uses the available width and wraps only after a hyphen.

**Fixed — `GET /api/v1/system/health` said the vulnerability database was `0s old` for anything under an hour.** It now says `54m old` or `26h old`.

**Fixed — a policy form accepted an SLA window of `0s` and only the apply failed.** The field is now marked on the form, like the triage duration already was.

**Changed — the New policy form proposes the same defaults the operator and the documentation use.** SLA windows critical 24h, high 168h, medium 720h, low 2160h; triage 2160h. Policies you already saved are unchanged. A policy written with `kubectl` that leaves a window unset is shown with these values and the diff says so before you apply.

**Changed — the scanner logs a line when CISA's catalogue is checked and unchanged**, and `kev_state` carries `checked_at` next to `fetched_at`, so "last checked" is honest even when nothing new was published. Unset times are left out of `kev_state` and `trivy_db_state` instead of being written as the year 0001.

No migrations and no new chart values.

## 1.3.5 — 2026-10-08

A hotfix for what the first 1.3.4 installations showed on screen. Nothing changes in admission or scanning.

**Fixed — a policy written with `kubectl` and no SLA or triage durations opened in the editor as `0s`, with What-if greyed out and nothing marked.** The form now proposes the defaults the New policy form uses, the diff shows `0s` becoming that default, and a field that fails validation is marked on the form when it loads and when What-if or Apply is clicked.

**Fixed — a Falco policy set to Stop the pod was labelled Notify in the Policies list, in Events and in the evidence package.** It is now labelled Stop the pod everywhere, and a policy that only opens an issue is labelled as such. `report.json` carries `runtime.rules[].effect` and `runtime.decisions[].policy_effect`: the action the policy was set to take. Whether the stop went through is the `runtime_pod_stop` row in `runtime.audit_entries`, as before.

**Fixed — a pod stop by a runtime policy appeared in the evidence package as `user:unresolved`.** It is now written as `policy:<name>`, and is no longer counted among the rows that could not be tied to an account.

**Fixed — the dashboard, Settings › About and the evidence package named the cluster after the first node instead of the chart's `clusterName`.** The chart value is now used wherever a cluster name is shown; the node name is the fallback when it is empty.

**Fixed — the Audit Log showed times in UTC while every other page uses your local time.** The page now uses local time; the CSV export keeps its ISO timestamps.

**Fixed — three layout defects.** The Images table ran off the page at 1600 px; the runtime decisions table in the console's package view hid its last columns; the Stop the pod policy form needed scrolling on a 1366×768 screen. The dashboard's operator uptime now shows minutes under an hour instead of `0h`.

**Changed — the Vulnerability DB tile no longer reports a next update as overdue.** The operator refreshes the database and the KEV catalogue every six hours on its own; the tile now shows when it last checked, next to the build date of the database Trivy ships. Administrators get an Update now button on the tile. It asks the scanner to download at once and reports whether the database changed, was already current, or the download failed and why; the request is recorded in the Audit Log as `vulnerability_db_refresh`. A refresh that fails on its own is shown on the tile too.

**Changed — the Admission webhook tile no longer compares review latency with a fixed budget.** The average and p99 of the last 24 hours are still shown. The first review of an image resolves its digest at the registry and takes longer than later reviews, which answer from cache.

No migrations and no new chart values.

## 1.3.4 — 2026-10-08

**Fixed — the break-glass section of an evidence package read its details from the policy as it stood when the package was generated.** Once a break-glass window had been switched off, a package covering it listed the activation with the approver, reason and incident reference blank and the window end taken from the current policy. Each activation is now read from the policy revision its admissions were decided under, so the package says what was approved at the time. Regenerate any package that covers a past break-glass window to get the full record.

**Fixed — triage decisions in the evidence package reported severity `UNKNOWN` for every CVE.** The severity now comes from the scan findings; a CVE recorded at more than one severity reports the highest.

**Fixed — the admission section in the console's package view counted grouped rows as denials and left time, namespace and pod empty.** The count is now the number of refused reviews, and each row carries the time, namespace and pod of its record.

**Fixed — an image admitted under break-glass kept showing its earlier refusal, so the dashboard's break-glass share stayed at zero.** The images list and the dashboard now show the latest verdict any review of that image recorded.

**Fixed — opening a policy in the editor showed a one-line diff with nothing changed.** Durations such as `168h0m0s` and `168h` are now compared in one form.

No migrations and no new chart values.

## 1.3.3 — 2026-10-07

**Fixed — on a fresh install, or an upgrade that brings a migration, a webhook or scanner pod could restart once before settling.** The replicas start together and each applied the database migrations; two of them raced on the same step, the loser exited with a `duplicate key` error and came back a few seconds later with everything in place. The migrations now run under a database lock, so the first replica applies them and the others wait and find them done. Nothing was lost before, and nothing changes in a running installation; the restart count on day one is now zero.

No migrations and no new chart values.

## 1.3.2 — 2026-10-03

**Fixed — if you copied the falcoctl values from the 1.3.1 rule editor, add `falco-rules:5` back to them.** The values left out the Falco chart's default reference. Helm replaces a list instead of merging it, so pasted as shown they stopped falcoctl from installing `/etc/falco/falco_rules.yaml`, which `rules_files` still listed. The editor now shows `falco-rules:5` in both `install.refs` and `follow.refs`.

**Fixed — the Runtime alert description in a channel's event list was out of date.** It said the pod keeps running and mentioned an issue threshold that no longer exists. It now says what is sent: a message when a policy with Send a notification matches, and an issue when the policy has Open an issue on.

**Fixed — the Stop the pod hints in the policy form said the pod is deleted and killed within a second.** The pod is evicted with a one-second grace period, and the hints now say so.

No migrations and no new chart values.

## 1.3.1 — 2026-10-03

**Changed — remove `runtime.enforceBlocks` from your policy files: runtime blocks are gone.** The policy resource no longer has a `runtime` field. With its default strict validation, `kubectl apply` refuses a policy that still has it with `unknown field "spec.runtime"`. Runtime events no longer change admission decisions. Migration 0031 turns runtime policies with action `block` into `notify` with an issue, and the API refuses `block`. To act on a running pod, use `stop` below.

**Changed — upgrading from 1.3.0 applies migrations 0026 to 0032 on first start, and they move forward only.** `helm upgrade --reuse-values` works across the version: `integrations.falco.connection` is read with its default, `mtls`. A return to 1.3.0 is a restore from backup, as the upgrade page says.

**Changed — a notification channel created in the console has Runtime alert (`runtime_alert`) switched on.** Only events a runtime policy chooses to notify about are sent. Before, a channel added after the policy did not get them. Existing channels keep their subscriptions.

**Changed — the audit log shows the last month by default, a page at a time, with a date range for anything older.** Before, the page held the newest 200 entries and nothing older could be reached from it. The CSV export (Enterprise) covers the whole range selected, not the page on screen.

**Changed — the images and vulnerabilities lists are read a page at a time.** Their filters, search and sort run in the operator, and the counts above each table still cover everything. `GET /api/v1/images` and `GET /api/v1/vulnerabilities` page when given `limit` and `offset`, and return the whole list as before without them.

**Added — a runtime policy can stop the pod an event came from.** The operator evicts the pod through the API server, so PodDisruptionBudgets apply. `stop_mode: immediate`, the default, uses a one-second grace period. `graceful` uses the pod's own termination grace period. Stopping needs `rbac.allowEnforce: true`, and pods in the operator's own namespace are never stopped. Every attempt is written to the audit log as `runtime_pod_stop` with the pod UID.

**Added — Falco rules can be written in the console (beta).** Falco > Rules > New rule edits a Falco rules file for the Falco version running in your cluster and validates it with that Falco image in a one-off pod. Each accepted text is saved as a version. Publishing pushes a version to your own OCI registry as a falcoctl `rulesfile` artifact, which your falcoctl installs and follows. Attestkeep does not write to Falco.

**Added — Falco can connect through Falcosidekick.** With `integrations.falco.connection: sidekick`, events come from Sidekick's webhook output with the same client certificate. `mtls`, the default, is Falco's own `http_output` as before. Each event records whether Falco or Sidekick delivered it, and the console warns when that does not match the setting.

**Added — when a licence covers fewer frameworks than were used, an administrator chooses which to keep.** The choice is asked at sign-in, holds until the licence changes, and is audited; the others close for new packages, and packages already generated stay downloadable.

**Added — Settings > Backup lists every configuration export and import**, with who, when and what the bundle carried. The bundle itself is not kept.

**Added — the dashboard has a Nodes card**: Ready nodes against the node ceiling, beside the image quota.

**Fixed — after a licence lapsed, the usage screens could show the allowance it had earlier in the month.** Admission applied the Community allowance while the dashboard and the Usage and Licence page still showed the paid one. The current month is now read against the licence in force; earlier months keep the allowance they had.

**Fixed — after a licence lapsed, every framework already used stayed open for new packages.** They now wait for the administrator's choice above.

**Fixed — a runtime alert with no channel to receive it was counted as notified.** The evidence package counted it as sent. An alert now counts as notified only when at least one enabled channel is subscribed to receive it.

**Fixed — the message and the issue for a runtime alert said the pod was still running when the policy had stopped it.**

**Fixed — the dashboard's Recently blocked admissions listed allowed admissions too.** It now lists refusals only, and older refusals are no longer pushed out by recent allowed ones.

## 1.3.0 — 2026-10-01

**Changed — activation now requires a certificate that carries the node ceiling; re-activate with a key issued by licence service 1.3.0 or later.** A 1.3.0 operator refuses, at online and at offline activation, a certificate without the node ceiling, with "re-activate with a key issued by licence service 1.3.0 or later".

**Changed — upgrading from 1.2.x applies migration 0025 on first start, and it moves forward only.** `helm upgrade --reuse-values` works across the version: `nodes.pollInterval` and `nodes.graceDays` are read with their chart defaults, `5m` and `14`, when an upgrade carries the previous release's values forward. Rolling the chart back does not roll the schema back; a return to 1.2.x is a restore from backup, as the upgrade page says.

**Changed — the licence page shows nodes per cluster.** Its hint no longer says a licensed cluster may run any number of nodes: the licence states how many clusters it covers and how many Ready nodes each of them may have.

**Added — a node ceiling per cluster, from the plan, with a 14-day grace.** The operator counts the cluster's Ready nodes every `nodes.pollInterval` (`5m`) and compares the count with the ceiling in the certificate; the count never leaves the cluster, and the daily check still sends the same three values. Going over stops nothing. If the cluster is still over after `nodes.graceDays` (`14`), image names never seen this period are denied at admission with "node ceiling of N exceeded", and a denied name is not counted; everything already counted keeps running and keeps being enforced. Coming back within the ceiling clears the clock at once, and a poll that cannot count changes nothing. Neither value loosens the ceiling.

**Added — the dashboard shows Nodes n / m and, while the cluster is over its ceiling, a strip with the date new image names will be denied from.** Once that date has passed, the strip says enforcement is on.

**Added — four notification events: `nodes_80`, `nodes_over`, `nodes_enforced` and `nodes_cleared`.** `nodes_80` fires at 80 percent of the ceiling, `nodes_over` when the cluster goes over (with the date enforcement starts), `nodes_enforced` when the grace period ends with the cluster still over, and `nodes_cleared` when it is back within. Each transition notifies once. A new channel has `nodes_over` and `nodes_enforced` ticked; the other two are opt-in.

**Added — new metric series.** `attestkeep_nodes{kind="count"|"ceiling"}` (`-1` = no ceiling) and `attestkeep_node_overage_seconds`, how long the cluster has been over its ceiling, 0 while within. Node denials count under `reason="quota"` on `attestkeep_admission_denials_total`.

**Added — an evidence package's `generation` block carries `nodes {count, ceiling}`.** The cluster's Ready nodes as the operator last counted them at generation and the licence's node ceiling (`-1` = none), numbers only; `count` is `null` when no count had been taken.

## 1.2.0 — 2026-09-30

**Changed — upgrading from 1.1.x applies migrations 0021 to 0024 on first start, and they move forward only.** `helm upgrade --reuse-values` works across the version: the values 1.2.0 adds are read with their chart defaults when an upgrade carries the previous release's values forward, so the Falco integration stays off until you turn it on and stored runtime events are kept for 90 days. Rolling the chart back does not roll the schema back; a return to 1.1.x is a restore from backup, as the upgrade page says.

**Changed — if your Falco events arrive through Falcosidekick with a bearer token, they stop arriving on upgrade until you connect Falco the new way.** Falco now posts from its own `http_output` straight to the operator, over mutual TLS, on a port of its own. `integrations.falco.enabled: true` opens that listener on `integrations.port` (`8444` by default), and the operator creates a client CA and one client certificate for Falco in the Secret `<release>-falco-mtls`; the listener accepts only that certificate. Download the three files Falco needs — `ca.crt`, `client.crt`, `client.key` — from the console under Settings > Integrations, or from `GET /api/v1/integrations/falco/bundle` (admin, audited), put them in a Secret in the Falco namespace and point the Falco chart at it; the values are on the runtime events page. There is no token and no Falcosidekick: the API port no longer serves `POST /api/v1/integrations/falco`, `integrations.falco.existingSecret` and `integrations.falco.minPriority` are no longer read, and the old token Secret can be deleted.

**Changed — every Falco event is now stored; there is no priority floor on the operator's side.** What an event leads to is decided by the runtime rules below, not by Falco's priority, and volume is handled by age: `runtime.retentionDays`, 90 by default, removes stored events older than that every hour, and `0` keeps them. Issue history, audit entries and rule revisions are never removed by it. `attestkeep_runtime_events_dropped_total` no longer has a `priority` reason. Falco's own `falco.priority` is the place to stop traffic you never want kept.

**Changed — the chart's Role names one more Secret, `<release>-falco-mtls`. An installation that manages its own RBAC adds it before turning the Falco integration on.** It holds the Falco client CA and the certificate issued from it; the write access stays `resourceNames`-scoped to the operator's own Secrets in its own namespace.

**Fixed — `ImageSecurityReport` objects now carry the scan. Affects anyone who reads the report objects with `kubectl`.** Before 1.2.0 every report showed zero counts in `status.summary`, no `status.vulnerabilities`, and `status.lastScanned` set to the admission time rather than the scan's, and a triage decision was never mirrored onto the cluster object. The webhook now writes the scan's summary, its findings (most severe first, at most 1000) and the scan's own time, and a scan that finishes after admission refreshes every report of the digest; a review with no scan behind it leaves those fields as they were. Admission decisions were not affected: they are taken from the operator's database.

**Changed — if you read person fields from an evidence package's `report.json`, they now hold `user:<account id>`, never a name or e-mail.** `generated_by`, `chain[].actor` for audit-log rows, `triage[].triaged_by`, `runtime.blocks[].released_by` and `runtime.audit_entries[].actor` name the account; the console's audit log still shows names, and it is where the operator resolves an id when an auditor asks. Rows recorded before 1.2.0 hold only a name: at generation such a row is written as the one account whose display name or e-mail it matches exactly, or as `user:unresolved`, counted in `generation.actors.unresolved_rows`. Packages generated before 1.2.0 keep the names they were signed with.

**Changed — deleting a user now disables the account instead of removing it.** A disabled account cannot sign in and its sessions end; its id and its audit rows stay, so every `user:<id>` in an issued package still resolves. For an erasure request, an admin can then **Anonymise** the disabled account: in one transaction its name, e-mail and avatar are blanked and every copy of its name in the audit log, triage decisions, runtime block releases and runtime rules and their revisions is rewritten to `user:<id>`. The response and the audit entry state how many rows were rewritten. The rows themselves stay, packages already signed keep what they were signed with, and comments already posted to an external issue tracker are not rewritten.

**Changed — the `triagedBy` of an `ImageSecurityReport` triage entry is now `user:<account id>`.** The report is a cluster object that no anonymisation reaches, so no name is written there. Entries written before 1.2.0 keep the display name; an entry written by the kubectl plugin leaves the field empty.

**Added — runtime rules decide what a Falco event leads to.** Each stored event is checked against the rules written in the console's new Falco section, in order, and the first rule that matches decides; no match keeps the event and sends nothing. A rule has a match (Falco rule names, tags, priority, source, output fields, the image's last verdict and signature, namespaces), a window of `count` events within `duration`, counted per image digest, and an action: `allow`, `record`, `notify` or `block`. `notify` sends to the notification channels subscribed to the new `runtime_alert` event, at most once per rule and image per throttle period (an hour by default), and can open an issue in the GitHub, GitLab or Jira channels subscribed to it, one per image digest and Falco rule, titled `RUNTIME: <rule> in <image>` and labelled `runtime`. A runtime issue closes as `quiet` (no event of that rule on that image for 7 days), `image_retired` or `released`; none of them counts as a fix. A channel receives `runtime_alert` only once you tick it. Every rule change stores the whole rule set, with its hash, as a revision and is written to the audit log.

**Added — a runtime block can keep new pods of an image out, where a policy says so.** A `block` rule whose window is reached on an image digest opens one runtime block for that digest and rule, and also notifies and opens an issue. The block stays open until an admin releases it with a reason and a note — in the console's Falco > Blocks page or with `POST /api/v1/runtime/blocks/{id}/release` — or, for a rule with `block_until: window`, until the window passes with no further event; the hourly sweep also releases it once the image has not run for a day. A new policy field, `runtime.enforceBlocks` (default `false`), makes an open block refuse admission in that policy's namespaces, with a reason naming the rule, the Falco rule, the count and the first event; without it the pod is decided as before and its ledger row carries a warning. Nothing already running is touched, and an alert stream that stops opens no blocks and refuses nothing. A triage release closes the block's runtime issue as `released`, and a block released as a false positive offers **Make an allow rule**, prefilled from its latest event. A policy what-if replay reports `denied_by_runtime`.

**Added — the evidence package's `runtime` section says what the rules decided and what runtime refused.** It carries the rule set in force and its revision hash, `audit_entries` (rule changes, block releases and integration changes in the period, each with its `kind`), matches by rule and action, the decisions taken (up to 500, each with the issue it opened), the blocks opened or released, how many admissions runtime refused, and coverage: whether the integration is on, the last event and the longest silence in the period. Each decision carries `event_time`, Falco's own timestamp, and `received_at`, when the operator received it; a block's `first_event_at` and `last_event_at` are on Falco's clock and its `opened_at` and `released_at` on the operator's; `coverage.clock` names the clock coverage is measured on. `include_runtime_raw: true` on `POST /api/v1/evidence`, a checkbox in the Generate dialog, adds the stored events themselves, up to 5000.

**Added — each requirement in an evidence package lists the tests that answered it.** `framework.requirements[].tests[]` gives, per test, its `method` (`TEST` when it reads a record of what happened, `EXAMINE` when it reads a configuration), `result`, `observation`, typed `evidence[]` paths, `source` and `collected_at`. Every requirement carries at least one test, the SOC 2 and EU CRA/NIS2 mappings included. Each requirement also gains `result` and `implementation_status` in OSCAL's words; `status`, `note` and `evidence[]` stay as they were. The PDF prints the tests beneath each requirement.

**Added — an evidence package says how it was produced and what it was drawn from.** A new `generation` block states when and by what the document was generated, the source system, the query window (end exclusive, UTC), each section's query in words with its row count and whether a capped query hit its cap, and the actor scheme. `admission.records[]` carries every admission review of the period, one row each and with no cap, so a sample can be drawn from the whole population; the PDF prints how many there are and where they are. `organisation.declarations` carries the operator's own statements of time source and retention policy, entered under Settings > Organisation > Operator declarations; the product does not measure either, and the PDF labels both "declared by the operator".

**Added — each admission records the Kubernetes identity that asked for it.** The ledger keeps the requesting username. In an evidence package a `system:` identity (service accounts, controllers) is written as the API server gave it; any other username is written `k8s-user:<first 16 hex characters of its SHA-256>`, and the operator resolves the pseudonym from the ledger.

**Added — new metric series and a denial reason.** `attestkeep_runtime_rule_matches_total{rule,action}`, `attestkeep_runtime_alerts_notified_total`, `attestkeep_runtime_blocks_open` and `attestkeep_runtime_admissions_denied_total`; the `reason` label on `attestkeep_admission_denials_total` gains `runtime`.

## 1.1.1 — 2026-09-16

**Added — a cluster with no route to the licence server can be activated with a certificate instead of a key.** The console's activation screen and its licence page download an activation request written by this cluster; the licence page at attestkeep.com issues a certificate against it, valid for that cluster and no other, and the console takes the certificate back. The operator verifies its signature, the cluster fingerprint and its own key before storing it, runs no daily check for it, and warns thirty days before it expires; a certificate that belongs to another cluster, another key or has expired is refused with the reason as the operator gave it. For installs that never open the console, `license.existingCertificateSecret` names a Secret holding the certificate under the key `certificate`; it is installed only when no certificate is held or it runs later than the one held, so a Secret left behind after a console rotation never puts an older term back.

**Added — the licence page can hand the licence back.** A **Deactivate** button, behind a confirmation: on the online path it gives the cluster's slot back; on the offline path it deletes the certificate here and leaves the slot for support to release.

**Fixed — a pod that had restarted could not give its licence slot back.** It held a certificate without the licence id it names, so deactivation was refused and the slot stayed taken. A restarted pod now reads both back from the certificate and the stored binding.

**Fixed — the mirrored KEV catalogue for air-gapped installs could not be created, and nothing mounted it. Affects clusters that set `kev.source` to a file.** CISA's catalogue is larger than a ConfigMap holds; a mirrored file may now be gzipped, and is read by its first bytes rather than its name. `kev.existingConfigMap` names a ConfigMap in the release namespace that is mounted read-only at `/etc/kev` on the scanner; point `kev.source` at `file:///etc/kev/<key>`.

**Fixed — with `scan.cosignOffline`, keyless verifications hung until the scan timed out.** A keyless check is now reported as unverifiable at once, key-based checks still run, and no cosign call outlives ninety seconds.

**Changed — rebuilt on Go 1.26.6 and grpc 1.83.2.** 1.1.0 was built on Go 1.26.3 and grpc 1.83.0, which carry vulnerabilities fixed in those versions. The chart-managed PostgreSQL moves to 16.15.

## 1.1.0 — 2026-09-10

**Changed — upgrading from 1.0.2 applies migrations 0013 to 0020 on first start, and they move forward only.** `helm upgrade --reuse-values` works across the version: every value this release adds carries a chart default, so an upgrade that keeps your installed values takes those defaults. The chart also generates a `<release>-data-key` Secret on the upgrade and preserves it afterwards — add it to your backup set, because a tracker credential sealed under a key you no longer hold cannot be opened and its channel needs its token entered again. Rolling the chart back does not roll the schema back; that is a restore-from-backup exercise, as the upgrade page says.

**Added — admission can judge an image more strictly according to where the pod is going to run. The chart's ClusterRole gains read access to Services and Ingresses, so an installation that pins its own RBAC has to grant them.** A new policy block, `deploymentContext`, takes `mode` (`Ignore` by default, `Escalate`) and `signals`. Admission derives six facts about every pod — `privileged`, `root`, `hostNamespace`, `hostFilesystem`, `capabilities` and `exposed` (hostNetwork, a hostPort, a NodePort or LoadBalancer Service selecting the pod, or a ClusterIP Service behind an Ingress) — and records them on every ledger row, under `Ignore` as well as `Escalate`. Under `Escalate` a pod carrying a selected signal, and no other pod, is judged more strictly: denying on CRITICAL also denies on HIGH, denying on HIGH also denies on MEDIUM, and a known-exploited or end-of-life warning becomes a refusal. An empty `signals` list means all six. Context can only make a policy stricter, never looser, and the refusal names the signal and, for exposure, the Service or Ingress that produced it. An operator that cannot list Services and Ingresses derives exposure from the pod spec alone, logs the namespace and admits: exposure that cannot be established is not asserted.

**Added — a new critical finding can open an issue in your own GitHub, GitLab or Jira, and close it again when the finding ends.** GitHub Issues, GitLab Issues and Jira are three new notification channel kinds; they subscribe to the `critical_finding` event like any other channel. One issue is opened per image digest and CVE, whatever the number of rescans, namespaces or clusters, and a channel's very first run against an existing cluster with more than five findings files one summary issue instead of a burst. Each channel opens at most `dailyCap` issues, 20 by default, in a rolling 24 hours. Every open issue is re-checked every ten minutes and closed with a comment naming why: `fixed` (the digest's newest scan no longer reports the CVE), `triaged` (an unexpired triage decision covers it) or `image_retired` (no pod has run that digest for 24 hours). Only `fixed` counts as remediation and the three are reported separately. Evidence packages gain an `issues` section — opened, still open, closed by reason, fixed inside the declared critical window, and a row per tracked finding — and the `remediation-windows` attestation can now reach `met` instead of being permanently partial. A disabled channel still closes the issues it opened; a deleted channel cannot, and its issues stay open until somebody closes them by hand. The minimum permission for each provider is in the operator documentation; a Jira Cloud scoped API token authenticates only against the API gateway, `https://api.atlassian.com/ex/jira/<cloudId>`, not against the site address.

**Added — tracker credentials are encrypted at rest.** The GitHub and GitLab token and the Jira API or bearer token are stored as AES-256-GCM ciphertext bound to the channel and the field it belongs to, under a key the chart generates into the `<release>-data-key` Secret on first install and preserves across upgrades; point `api.dataKey.existingSecret` at your own Secret to supply it from a secret manager instead. Channels saved before this version are sealed in place on the first start of the new one, with nothing to run by hand. Without the key a tracker channel is refused rather than stored in the clear, and nothing else about the product depends on it. The configuration bundle carries neither the token nor its ciphertext, so an imported tracker channel arrives disabled until its token is entered again. Re-keying is not offered in this version. Channel actions — create, update, delete and test — are recorded in the audit log as user activity, and are not part of evidence packages.

**Added — Falco's runtime alerts can be filed against the image that produced them.** A new endpoint, `POST /api/v1/integrations/falco`, accepts Falcosidekick's generic webhook output. It exists only once `integrations.falco.existingSecret` names a Secret holding its bearer token; until then it answers `404`. `integrations.falco.minPriority` sets the floor, `warning` by default, and the body cap is 64 KiB. Events are stored against the image that produced them, shown in the console's images list as a Runtime column covering seven days and on image detail as the last 20 alerts, and delivery is idempotent, so a redelivered alert is one row. Evidence packages gain a `runtime` section and the `runtime-observed` attestation. No admission verdict changes because of a runtime event, and runtime detection itself stays outside what Attestkeep does: Attestkeep does not ship, install or run Falco.

**Added — policies can act on the base operating system of an image, not only on its vulnerability counts.** When a scan finds that the image's base OS is past its vendor's support window, the new `endOfLifeOS` setting decides what happens: `warn`, the default, admits the image and tells you on the spot that no security fixes will ever be published for that release, so its findings can only grow; `block` refuses the image outright, whatever its counts are; `ignore` says nothing. Existing policies behave as `warn` without any change on your part, and the base OS and its support state are shown on each image's detail panel.

**Added — CISA Known Exploited Vulnerabilities gate.** Attestkeep now keeps a copy of CISA's KEV catalogue, refreshed every six hours, and marks every finding whose CVE appears on it. A new policy field, `knownExploited`, decides what admission does with those findings: `block` refuses the image whatever its severity counts are, `warn` admits it and prints which of its CVEs are being exploited in the wild, `ignore` says nothing. `warn` is the default, so existing policies keep admitting exactly what they admitted before and start reporting why they should not. Triaged CVEs are excluded, the same way they are excluded from the severity thresholds. The denial reason names the CVEs rather than a count, so a refused deployment says what to fix. Vulnerability and image pages mark affected findings with a KEV badge and the catalogue's dates and can be filtered down to them; the dashboard shows which catalogue version is in force, and evidence packages record it alongside the vulnerability database version. Clusters without internet access can point `kev.source` at a mirrored copy of the catalogue, or set it empty to keep the copy they already have.

**Added — a SLSA build provenance gate that binds to who signed, not only to what the predicate claims.** A new policy block, `provenance`, takes `minLevel` (0 to 3, and 0 — the default and what an absent block means — switches the gate off) and `trustedBuilders`, each entry naming an `id`, the `level` this operator credits that builder with, and optionally the `signer` and `issuer` its certificate must carry. An image whose verified SLSA provenance, v1 or v0.2, does not name a trusted builder, or whose signing certificate identity or issuer is not the one the entry accepts, or whose builder is credited below `minLevel`, is refused, and the reason names the builder, the signer or the level. The identity is read from the certificate the registry stores beside the attestation; an image whose certificate cannot be reached or parsed is refused rather than admitted on the predicate's word. Left unset, `signer` must equal the builder id and `issuer` accepts any. The scan row and the console's image detail carry the provenance predicate, builder, signer and issuer, and evidence packages gain `provenance-verified` facts. The SBOM and vulnerability-attestation checks are unchanged: they still verify that somebody signed, and only this gate binds to who.

**Added — a producer's own OpenVEX statement can take a finding out of the counts admission decides on.** A new policy block, `vex`, takes `mode` (`ignore` by default, `apply`) and `trustedIssuers`, each entry naming either a keyless `identity` and optional `issuer` or a PEM `key`. A statement is read only when it arrives as a signed in-toto attestation on the image itself and the policy names its signer; unsigned statements, statements from a signer the policy does not name, and statements whose product is not this image are recorded as seen and ignored. Under `apply` a trusted `not_affected` or `fixed` statement suppresses that finding for the thresholds and for the known-exploited rule, and the allow reason records how many findings were suppressed and by which author. `affected` and `under_investigation` never suppress anything. Suppressed findings stay in the record, flagged, behind a "show suppressed" toggle in the console, and the evidence document lists every one of them with the producer's own words. Suppression is decided at admission from the policy in force, so switching `mode` takes effect on the next pod; adding a new issuer takes effect at the next scan of the digest, because nobody has verified that signature yet. Evidence packages gain a `vex` section and the `producer-statement-honoured` attestation.

**Added — a draft policy can be replayed against what the cluster already decided, before it is applied.** `POST /api/v1/policies/whatif`, and a **What if** button beside *Apply to cluster* in the policy editor, decide a draft against the admissions of the last 1 to 90 days — 30 by default — and report what would change: unchanged, would be denied, would be allowed, broken down by the gate behind each difference, with up to two hundred of the changed admissions listed. The same function decides them that the admission webhook runs, so the preview and the gate cannot drift. Nothing is written: no pod is affected, no scan is queued, no registry is contacted and the licence meter is not touched. The one caveat the response states on every run is that decisions are replayed against each image's scan record as it stands now, not as it stood at the time, so this is a question about the images as they are rather than a reconstruction of history.

**Added — five more compliance frameworks, taking the mapped total to thirteen.** PCI DSS v4.0.1 covers Requirements 6.3 and 6.5, 10.2 and 11.3; 6.3.1 reads the CISA KEV catalogue as its industry-recognised source and 6.3.3 measures the declared critical remediation window against the one month the standard allows, while the web application and payment page clauses of 6.4, the Approved Scanning Vendor scans of 11.3.2 and the entity's own risk analysis are named and marked outside scope. The MAS Technology Risk Management Guidelines of 18 January 2021 cover the paragraphs on information assets, application security, patch, change and release management, system and virtualisation security, threat intelligence, and vulnerability assessment and remediation; 7.3 is answered directly because a scan records whether a base OS is past end of support and `endOfLifeOS` decides what admission does about it, while virtual machine images, the institution's own approval processes and the independent IT audit of section 15 are marked outside scope. The ASD Essential Eight Maturity Model of November 2023 is mapped for the three strategies a cluster can speak to — patch applications, patch operating systems and the one limb of application control with a cluster analogue — at Maturity Levels One to Three; the other five strategies are named and marked outside scope, and where a level states one window for internet-facing servers and a longer one elsewhere, the stricter limb is the one mapped. The Control Criteria of ISMAP, Japanese edition of 1 August 2024, are mapped onto the controls criteria of attached table 3 that a cluster's admission control and image scanning can answer, and every clause says whether its control is a basic statement requirement; the governance and management criteria and the people, physical, network and access controls are marked outside scope, and where the official English text only points at ISO/IEC 27002 the obligation is translated from the in-force Japanese text and the citation says so. The ISMS-P certification criteria, as explained in KISA's guide of November 2023, are mapped onto the criteria of domains 1 and 2 that a cluster's records can answer; there is no official English text of the criteria, so every clause is our translation of the Korean criterion sentence and says so in its citation, and because each criterion bundles a technical measure with a procedure the mapping reports partial rather than met by design. Every mapping counts the clauses it cannot answer and marks them outside scope with the reason, as the eight before them do.

**Added — five new attestations feed those mappings.** `patch-window-48-hours` is met when the declared window for critical findings is at most 48 hours and known-exploited vulnerabilities are refused at admission; `patch-window-two-weeks` when the declared window for high findings is at most two weeks; `runtime-observed` only when a runtime feed is configured *and* delivered something inside the period, because from inside the operator a detector with nothing to say and a detector that stopped are the same silence; `producer-statement-honoured` when the policy applies producer statements and names at least one issuer to trust; and `context-aware-thresholds` when the escalation gate is on and acts on both `exposed` and `privileged`, partial when only one of the two is selected, and a gap under `Ignore`.

**Added — new metric series and denial reasons.** `attestkeep_runtime_events_total{source,priority}` and `attestkeep_runtime_events_dropped_total{reason}`; `attestkeep_vex_statements_total{status}` and `attestkeep_vex_rejected_total{reason}`; `attestkeep_issues_opened_total{provider}`, `attestkeep_issues_closed_total{provider,reason}` and `attestkeep_issues_skipped_total{reason}`; `attestkeep_admission_context_total{signal}`, whose six labels are pre-created so a signal at zero is a series rather than absent data; and `attestkeep_policy_whatif_runs_total`. The `reason` label on `attestkeep_admission_denials_total` gains the four values the new gates refuse under: `end_of_life`, `known_exploited`, `provenance` and `context`.

**Fixed — the federated-access attestation no longer reads "federated to 1 an identity provider" when a single provider is configured.**

**Changed — the documentation now states what Attestkeep leaves to other tools** — runtime behaviour detection, misconfiguration scanning, cloud posture, code-level reachability and repository dependency scanning — and what to run beside it for each.

## 1.0.2 — 2026-09-08

**Fixed — every scan record in the operator's database named Trivy 0.55.0 in its database-version field, whatever the operator actually ran.** The value was a constant. A scan record now carries the version of the Trivy that produced it and the vulnerability database version it ran against, both read at scan time. Records written before the upgrade keep the old value until their next scan. The tool versions printed in the evidence document were read from the running binary and were never affected.

## 1.0.1 — 2026-09-06

**Changed — the Team edition includes 100 image names a month; the console's Usage & Licence page said 50.** Licences already issued carry the new band; a cluster picks it up at its next daily check.

**Fixed — operator pods that start together no longer all run the daily licence check at once.** Each pod's first check is spread over a short window, so the first one records it and the rest wait out the day, as 1.0.0 intended.

## 1.0.0 — 2026-09-06

**Changed — 1.0.0 is the 0.3.6 line declared stable. Nothing about an installed policy, licence or evidence document changes on upgrade.**

**Changed — `admissionTiming: DenyUntilScanned` is available in every edition, Community included.** Policy behaviour is never gated by licence; only capacity is (clusters, frameworks, image names). A Community policy that already set it was silently treated as AllowAndScan; from 1.0.0 it is honoured.

**Fixed — the daily licence check is now one call a day per cluster, however many operator pods run and however often they restart.** Every replica used to check in two minutes after its own start, so a rolling restart or two spent the day's allowance and the pods logged a refusal they could not act on. The check time is recorded in the operator's database and shared by all replicas. Enforcement was never affected: the certificate keeps working for its thirty-day term.

**Changed — the dashboard no longer marks the default `failurePolicy: Ignore` as needing attention.** The tile explains the trade instead: while the webhook is unreachable pods are admitted unreviewed, the window is recorded for your evidence, and the hourly reconciliation sweep reviews what came in. Set `webhook.failurePolicy: Fail` for a gate that holds while the operator is down.

## 0.3.6 — 2026-09-03

**Fixed — a pod blocked by workload hardening left no denial in the ledger. Upgrade if you run `workloadHardening` in `enforce` mode and rely on the ledger or evidence.** The pod was correctly refused at admission, but only the per-image evaluation was written, and a clean image on an otherwise refused pod reads as allowed — so the ledger, and any evidence built from it, showed the block as an allow. The pod-level denial, carrying the failing control and its reason, is now recorded with the decision. Denials from before 0.3.6 were never written, so they cannot be added to evidence for those periods.

## 0.3.5 — 2026-09-02

**Fixed — the console's licence card overstated what Enterprise includes.** It
described Enterprise as unlimited clusters with an SLA tier. Enterprise
includes five clusters (beyond five is an agreement) and there is no SLA tier.
Nothing about any licence changed — the card now matches what the licence
server always enforced.

**Added — the licence certificate's remaining runway is visible.** The
certificate your installation holds is its offline runway: it slides forward
on every successful daily check, so a date that stops moving means the
renewal route is blocked. The dashboard's operator tile and the licence page
now show the expiry and the days remaining, and turn amber inside the final
week — the same boundary as the expiry notification.

**Fixed — the verification link inside evidence packages led to a 404.** The
README in every downloaded package pointed at a page address that does not
exist on the documentation site; packages generated from 0.3.5 on carry the
working address.

## 0.3.4 — 2026-09-02

**Added — the admission ledger is now tamper-evident.** Every admission
decision is content-hashed when it is written, and the operator periodically
seals the ledger with signed checkpoints: each checkpoint carries the Merkle
root of the records in its range and chains to the previous checkpoint's
hash. The signing key is generated into the `attestkeep-evidence-key`
Secret — never stored in PostgreSQL — so rewriting ledger rows and re-signing
the seals require two different accesses. Evidence documents gain a ledger
section that states whether the record set verifies, and names the exact
records and seals that do not.

**Added — configuration export and import.** Settings → Backup downloads a
JSON bundle of notification channels, triage decisions, the user list and
policies, and imports it on another installation with a dry-run preview
before anything is written. Credentials never leave the cluster: webhook
URLs are stripped on export and such channels arrive disabled until the URL
is entered again; user accounts are listed but never auto-created; on
conflict the record already present always wins and the import report says
what was skipped. Both directions are written to the audit log.

**Fixed — an installation with no licence could land on the sign-in screen
instead of activation.** When no licence is active and no account exists,
sign-in now returns to the activation flow instead of a dead end.

**Changed — chart RBAC names one more Secret.** The namespaced write access
that previously covered only the webhook TLS Secret now also names
`attestkeep-evidence-key`. It stays `resourceNames`-scoped — the operator can
manage exactly those two Secrets in its own namespace, nothing else gains
write access anywhere.

## 0.3.3 — 2026-09-01

**Fixed — `runtimeReconciliation: enforce` destroyed the workloads it could not
re-admit.** Affects installations running `enforce`; `audit` and `notify` are
unchanged.

- Enforcement is re-admission, and re-admission needs something to build the
  replacement. A pod applied by hand has no controller, so evicting it answered
  the finding by deleting the workload the finding was about — leaving no
  denial, no admission, and a `population` section showing an absence where an
  unverified workload used to be. A pod applied by hand during an outage window
  is exactly the entry route the sweep exists to catch, so this was wrong in
  the case that matters most.
- A static pod failed the same requirement from the other end: the kubelet
  rebuilds the mirror without going near admission, so eviction looped without
  ever producing an event. It carries an ownerReference to its node, which is
  why the controller check alone called it managed; the mirror annotation is
  now read first.
- Both are now reported and left running, in the same bucket as a side-loaded
  image — named in the sweep, marked `unmanaged` in the workload list, and
  announced once per sweep as something only a person can decide.

Found by Vinh Nguyen, who read the feature and asked what happens when the
thing you stop has nothing behind it.

## 0.3.2 — 2026-09-01

**Fixed — the 0.3.0 and 0.3.1 charts deployed the 0.2.0 binary. If you
installed either, upgrade.** An installation on those versions has runtime
reconciliation configured and never running.

- The chart pinned `image.tag` to a fixed `0.2.0` in its values, and the 0.3.0
  and 0.3.1 releases bumped the chart version without bumping it. Both charts
  therefore deployed 0.3.x templates around a 0.2.0 operator, which does not
  contain the sweep at all: no `population` section in the evidence, no
  unverified count on the dashboard, and no
  `attestkeep_runtime_unmatched_digests` series.
- The tag now defaults to the chart's own `appVersion`, which the release
  stamps, so a chart and the binary it deploys can no longer drift apart. The
  release workflow refuses to publish a chart whose version disagrees with the
  build, or one that pins the tag at all.

**Changed** — if you set `image.tag` yourself, clear it. An explicit value
still wins, which is what the field is for.

```sh
kubectl -n attestkeep get deploy attestkeep \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
```

## 0.3.1 — 2026-09-01

**Changed — enforcement is now armed with two keys.** A policy set to `enforce`
does nothing until the chart also grants the permission with
`rbac.allowEnforce: true`, which is off by default. An audit-only install
carries no eviction right at all, and a policy asking for enforcement without
the grant logs what is missing rather than failing quietly.

**Fixed**

- Stopping a pod asks for its *eviction* rather than deleting it, so
  PodDisruptionBudgets are honoured: a service whose every replica is
  unverified drains at the pace its budget allows instead of going down at
  once. A budget that says no defers the pod to a later sweep.
- A digest whose pod was already stopped once is left alone for 24 hours. If
  its re-admission produced no allowed event — an unresolvable tag does this —
  stopping it again every sweep would be a crash loop administered by the
  security tool. It stays reported.
- The sweep's ledger query gets a partial index; on a long-lived install it was
  a sequential scan repeated every interval.

## 0.3.0 — 2026-09-01

**Added — runtime reconciliation: what the admission ledger cannot tell you.**

- The operator periodically reads every running container's observed `imageID`
  and checks it against the admission ledger. A digest with no admission event
  behind it — a workload that predates the install, entered during an outage
  window, or slipped through under `failurePolicy: Ignore` — is reported
  instead of staying invisible. The evidence package gains a `population`
  section, the dashboard shows the unverified count, and
  `attestkeep_runtime_unmatched_digests` is exported for alerting.
- What a finding does is the policy's choice: `spec.runtimeReconciliation` is
  `audit` (record), `notify` (announce a newly seen unverified image), or
  `enforce` (stop the pod so its controller recreates it through the webhook).
- The sweep's honesty markers travel with it: out-of-scope containers are
  counted apart, side-loaded images with no registry digest are reported as
  unverifiable rather than guessed at, and a truncated workload list says so.

Shipped with the chart defect described under 0.3.2 — go straight to 0.3.3.

## 0.2.0 — 2026-08-31

**Added — decisions are readable against the policy that made them.**

- Every admission decision records a content hash of the policy it was made
  under, and the revision snapshots stay resolvable, so a decision is read
  against the policy text as it stood rather than as it stands today. Evidence
  packages list the revisions that decided the period, and reviews recorded
  before hashing existed are counted apart rather than dressed up.
- The console's decision feed shows the policy and its revision hash on each
  review.

**Changed** — the Artifact Hub listing carries the product icon and links.

## 0.1.0 — 2026-08-30

**Added — the first published release.**

- Admission webhook: image scanning verdicts, severity gates, `:latest`
  refusal, digest enforcement, registry allow-lists, workload hardening,
  break-glass with expiry.
- Scan pipeline: Trivy-backed scanning with a PostgreSQL work queue, cosign
  signature and attestation checks, rate-limit-aware retry.
- Evidence: signed compliance packages (DSSE, in-toto Statement v1) mapped onto
  eight frameworks — SOC 2, ISO/IEC 27001:2022, NIST SP 800-53, NIST SP
  800-190, SSDF, DORA, EU CRA+NIS2, GDPR Article 32 — verifiable in a browser
  with nothing installed.
- Console: images, policies, findings, triage, evidence, notifications,
  licensing.
