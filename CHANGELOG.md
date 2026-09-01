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
cosign verify --key cosign.pub ghcr.io/attestkeep/attestkeep-k8s:0.3.3
```

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
