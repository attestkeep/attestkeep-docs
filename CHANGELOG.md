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
cosign verify --key cosign.pub ghcr.io/attestkeep/attestkeep-k8s:0.3.5
```

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
