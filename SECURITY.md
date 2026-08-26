# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.20.1+  | :white_check_mark: |
| 1.19.0+  | :white_check_mark: |
| 1.18.0+  | :white_check_mark: |
| < 1.17  | :x:                |

## Reporting a Vulnerability

To report security issues send an email to security@fedi.xyz (not for support).

## Federation Initiator bridge boundary

The bridge derives the stable FI signing key at child id 17 of the app root and
opens `fi-client` inside the globally reserved database prefix `0x07`. Changing
either value changes durable identity or storage ownership and requires an
explicit migration. Secret key material remains in the bridge identity
adapter; Manifold receives only the public `FiId` and library-constructed
digest signatures.

Pinned Fleet Manager locators are untrusted dialing input plus the public key
used to verify manager commitments. Parsing a locator is not a trust verdict.
Every Iroh connect and Fleet Manager request must remain deadline-bounded, and
responses that carry commitments must be verified against the locator key.

Mutating FI formation work is owned by `Runtime.task_group`, serialized to one
driver, and cancellable at bridge shutdown. RPC caller cancellation must not
detach an untracked formation future. The eligible-payer read is the deliberate
exception: it performs a bounded, read-only authenticated policy refresh in the
RPC caller future and intersects that result with fully loaded joined wallets.
Conversely, cancelling the task may leave durable protocol effects; launch
recovery must reopen the same database and call `resume` so exact quotes and
wallet operations are reconciled rather than replaced or spent twice. This
includes an unsynced persisted `Formed` record: it is projected as
`PublishingSeatBindings` and resumed until the FMan directory reaches consensus
before terminal success is exposed.

Explicit abandonment is a no-argument mutation serialized through that same
driver. The bridge delegates the value-safety decision to `fi-client` and must
never delete formation state directly: abandonment succeeds only before wallet
output generation is durably armed and before the federation is formed. Before
releasing the durable mutation's driver claim, Fedi invalidates every local
selection and replacement approval and detaches its unowned formation push
hook. This cleanup belongs to the driver so it still runs when either the paid
formation caller or the abandonment caller has disconnected. A durable
`Formation` to `Idle` transition is authoritative even if the subsequent
driver-lease release reports an error, so that error cannot retain stale local
authorization.

FI status snapshots are sensitive application state. They can contain Fleet
Manager locators, guardian/DKG codes, invite codes, quote-bound authorization
details, and exact payment terms. Neither handled nor orphaned stream payloads
may be written to routine UI logs or exported support logs. Stream diagnostics
must be limited to non-payload metadata such as stream id, sequence, method,
and whether a handler existed; the subscribed callback still receives the full
typed value in memory.

Post-formation liquidity uses a second network-facing boundary. Provider
advertisements are untrusted until `fi-client` verifies the signed Nostr event
and payload, the advertised provider identity, a current PeerBadge holder
authorization for the selected Manifold environment, and the signed Iroh node
identity. `BridgeLiquidityConnector` then dials that exact node with only the
Public Liquidity API ALPN; transport success is not a trust verdict. Discovery
is a fresh, bounded, no-private-data operation. The federation invite is passed
to a provider only inside `fi-client`, after the complete admission gate is
repeated immediately before the request. The bridge must not log the invite,
signed request, trust material, or endpoint capabilities. Operation snapshots
also contain provider identity, endpoint hints, amount bounds, semantic hashes,
and progress; exclude them from routine UI and support logs. Provider-private
failure reasons do not cross the RPC projection.

Liquidity `start` and `resume` mutations share the task-group-owned FI driver,
so dropping an RPC caller discards only its response while accepted work keeps
one serialized owner. Bridge shutdown may cancel an in-flight call only at the
Manifold durable checkpoint. The exact semantic operation remains available
through bounded, read-only `status`, canonical `current`, and cursor-paginated
`list` RPCs. On launch, the same driver reads Manifold's canonical current
operation and resumes that existing id; it must never invent a replacement
request after a lost response. Projected transport and provider errors are
sanitized. Item state and completion evidence remain provider-authoritative
and must be verified against the joined federation before the app presents
liquidity as ready. `actionRequired` is surfaced for an operator decision, not
converted into an automatic retry of a potentially irreversible provider
operation.

Completed gateway liquidity is not ready until `fi-client` registers the exact
validated gateway URL with the guardians and a fresh threshold-aggregated LNv2
read contains it. `BridgeFederationConsensusReader` must perform that real,
uncached read through the invite code; fabricating or caching membership would
silently defeat the post-write verification. The RPC projection exposes only
the resulting `gatewayViewVerified` boolean, never the gateway capability.

The Fedi wallet adapter (`bridge::fi_payments`) implements exact quote
recovery and idempotent refund settlement for paid formation through the pinned
Manifold contract. Production app RPCs expose only the verified selection
preview followed by explicit-payer `Pay & create`; pinned locators and separate
payment authorization remain internal diagnostic seams. If one exact paid row
is later proven safe to replace, production exposes only a fresh verified
replacement preview followed by its sealed approve/apply call. That one renewed
user action durably sets the replacement subset's cap; exact quotes at or below
it auto-authorize. A larger exact total parks before output signaling and can
continue only through the narrow exact-subset replacement-authorization RPC;
Manifold rejects that RPC for initial selected creation and every other state.
Formation always uses
zero guardian fee. The product-default 0.5% guardian fee is a distinct
post-formation maintenance operation, after `Formed`. That RPC accepts only a
rate. Manifold parses the exact federation id from its persisted formed invite
and passes it to the bridge's local fee-account capability; the bridge resolves
that already joined, Ready federation and returns
`spv2.our_account(AccountType::BtcDepositor)`. UI, RPC, and driver messages must
never carry an alternate FI recipient account. Missing joined state or SPv2
capability fails before any guardian vote, while Manifold retains account-shape,
role-separation, recipient-policy, and consensus-readback validation. FI RPCs
expose stable typed error categories; UI code must not branch on error strings,
and payment errors surfaced through the port must not carry remote or
wallet-internal detail.

Seat payments hold these invariants. A per-quote journal record in the paying
federation's client database (tag `0` under prefix `0xce`, `FiSeatPayment`;
`0xcc` and `0xcd` remain owned by the LNURL event consumer) commits in the same
database transaction as the funding transaction's submission state machines, so
recoverability is durable strictly before any network submission; an absent
record is proof that no funding began — but only in a client database that
has been continuously operated since before the quote. A database that began
life via recovery (federation rejoin from backup or scratch, device restore
from seed) may simply be missing a pre-recovery journal row, so paid
formation must not resume across such a boundary: the recovery probe refuses
to report "not started" when the client's persisted init mode is a recovery
(`ClientInitStateKey`). After a restart, the adapter has to work out where a payment got to
before letting anything move forward. The rules:

- Accepted by the federation: replay the saved evidence.
- Rejected: not final yet. The notes the payment tried to spend are
  refunded automatically, and we wait until every one of them is back in
  the wallet and spendable before reporting "rejected" and allowing a
  replacement. Reporting it early would let a new payment start before
  the money is back.
- Timed out: never treated as rejected. We just try again later.
- Accepted isn't "done" either: we also wait for the payment's own
  change to be back and spendable before reporting the payment prepared.

Two saved records must agree: the journal (which quote, what was bought,
which transaction) and the operation metadata (which outputs of that
transaction are our change). If either is missing or they disagree, we
stop rather than guess — recomputing the change range after a restart
could point at the wrong transaction.

Refund tracking only uses the wallet's own transaction history, matched
by transaction id because updates can repeat or arrive out of order. The
accepted refunds must return exactly the notes the payment spent —
nothing extra, no note twice. (On mint v1 the refund may arrive as one
bundle or as one transaction per note.) Anything partial, malformed, or
contradictory stops recovery and leaves the payment resumable.

Refund key material is re-derived from the paying federation's auxiliary secret
(child id 18) and the quote's public refund nonce; it is never persisted
anywhere. Refund settlement atomically claims a reverse index keyed by
refund-issuance hash (tag `1` under prefix `0xce`, `FiSeatPayment`) and records
a claim hash in the quote row before crediting,
so concurrent sibling settlements cannot both own one deterministic issuance.
It refuses a hash already claimed by another quote; exactly-once crediting
additionally depends on the FMan re-presenting the byte-identical refund
transaction when it retries a refusal for the same quote. A distinct credited
hash is written only after deterministic mint receive reaches terminal success;
the earlier claim is never sufficient proof for releasing/replacing a seat.

Aggregate readiness owns an opaque durable virtual-wallet reservation (tag `0`
under prefix `0xcf`, `FiFunding`) through Manifold's
`payment_outputs_started` tombstone and every journaled submission commit.
An O(1) active total (tag `1` under prefix `0xcf`, `FiFunding`) is updated in
the same transaction as every reservation/member transition; lifetime
settlement tombstones are therefore never scanned on ordinary balance reads.
`FederationV2::get_balance` subtracts every live FI reservation, so all ordinary
wallet sends continue to exclude that value after an app crash/restart. The FI
owner sees only globally available virtual balance plus its own reservation.
The row binds the exact signed quote/output plans and conservative fee ceilings
and retains one settlement tombstone per quote. Each submitted quote consumes
only its own member and removes that member from the active hold total in the
same transaction as its payment journal. Only a still-`Held` member may be
released for replacement, after the wallet proves no journal exists in a
continuously operated database. Consensus rejection or a settled signed refund
may authorize Manifold to replace a submitted seat, but the local member stays
`Consumed`; terminal release validates that tombstone and never restores held
value. A rejected funding transaction's automatic input refunds and an
FMan-signed payment refund are separate deterministic wallet credits, and both
must be spendable before their respective terminal proof exists. Dropping
Manifold's id/capability never releases funds, and accepted, pending, ambiguous,
and sibling members remain untouched. Authorization does not pick notes or build transactions; it only
reserves each seat's amount plus a fee allowance. That's deliberate: one
large note can pay several seats in a row through its change, and change
only exists once a real transaction is accepted. Each payment is built
one at a time under the spend lock, and its actual cost must fit inside
the seat's reserved amount.
After finalization, but before the funding database transaction commits, the
adapter reads the just-written transaction-submission state and calculates the
exact wallet debit as selected mint inputs minus returned change for mint-v1 or
mint-v2. That exact debit must fit both the captured virtual balance and the
reservation; consuming the reservation, journaling the quote, and publishing
the submission state machines are one atomic commit. It must not fund a seat
from accrued Fedi-fee reserves merely because physical balance is larger.

The FI database stores resolved intent, locators, signed public quotes,
quote-bound aggregate authorization, seat ids, guardian codes, and the final
invite. It must never contain identity secrets, raw ecash, payment signatures,
or refund secrets; seat-payment journals and refund derivations belong to the
paying federation's own client database and secrets. The adapter and its
projected RPC values must compile for native mobile targets and
`wasm32-unknown-unknown`.

Once the user authorizes the exact ecash outputs for a paid formation, the
funding federation records a durable virtual-balance hold before payment work
continues. The hold and its O(1) active total use distinct tags in prefix `0xcf`
of that selected payer federation's local Fedimint client database. Payment
journals and reverse refund claims likewise use distinct tags in prefix `0xce`.
They do not
live in the globally namespaced FI database, whose formation state may outlive
or be restored independently of this payer-wallet evidence. Both rows are
lifecycle state: changing their encoding, keys, or transition rules requires
either an explicit migration or a coordinated pre-launch reset for every test
or internal installation that may resume across revisions.
The pre-rebase FI-only `0xcb`-`0xce` layout is not migratable after master
assigned `0xcc`/`0xcd` to LNURL delivery state; internal installations from
that unreleased layout require a coordinated reset before using this encoding.

An ordinary process restart reopens the same payer database and must retain the
hold, active total, and every terminal member state. A seed restore, backup
restore, or federation rejoin can produce a new local payer database without
those rows even when restored FI state remembers the formation. Missing local
hold or journal evidence after such a recovery is ambiguous, never proof that
payment did not start: the paid adapter must fail closed and require an
explicit recovery path. `Consumed` and `ReleasedUnstarted` members are durable
replay tombstones. They must not be deleted or compacted unless a coordinated
rule proves that no surviving FI state, quote, journal, or refund can refer to
their aggregate token.

All balance checks and hold transitions are serialized by the funding
federation's spend lock. FI APIs accept a federation-branded guard so a lock
from one joined federation cannot authorize another federation's funds. The
atomic-consumption API also creates the database transaction from that exact
payer and passes callers a non-forgeable wrapper; it never accepts an arbitrary
raw transaction that could come from a different federation. A member has an
explicit `Held`, `Consumed`, or `ReleasedUnstarted` state. A positive bounded
debit moves `Held` to `Consumed` in the same database transaction that submits
the wallet funding operation. Only `Held` may be released without a payment
journal; consumed value is never restored by this layer. Exact retries are
idempotent and changed fingerprints, quote sets, or debits fail closed. Every
committed change to the projected wallet balance refreshes the normal
federation balance event. Successful exact retries also refresh it, so
cancellation after commit but before notification heals on the next retry.
Consumption returns a private balance-change token that the caller must emit
only after its transaction commits successfully. Emitting before commit
recomputes the old balance and does not satisfy the post-commit refresh; the
caller must retain the token across commit and emit it afterward.

### FI push-gateway boundary

FI notification ownership is a third deterministic key family, separate from
the FI protocol key and Fedi's social Nostr key. The bridge reserves global
root-secret child id 19, then domain-separates it with
`fedi-push-gateway/recipient-auth-nostr/v1` and the canonical Manifold
environment before deriving the Nostr key used for NIP-98 management requests.
Changing the child, label, or environment mapping or reusing another Nostr key
would orphan or link gateway ownership and requires an explicit migration.
Development/test, staging, and production identities must remain distinct.
The bridge pins the public recipient key produced for all three canonical
environment mappings in executable golden tests. A change to any golden is an
identity migration—not an ordinary refactor—and must ship with an explicit
gateway registration/hook ownership migration before the derivation changes.

The stable, at-most-128-byte `DeviceIdentifier` is the gateway installation id.
The native layer supplies the current FCM token and platform through the
registration RPC; it never supplies recipient identity, installation identity,
gateway URL, callback URL, or a signing key. FCM tokens and callback URLs are
secret-adjacent bearer material: do not format them, return them over RPC, add
them to error messages, or follow redirects while sending them. HTTP response
bodies are bounded and only a constrained gateway error code may cross the RPC
boundary. Each NIP-98 request includes a signed random nonce so identical
same-second operations do not collide in the gateway replay cache. Production
accepts only a compiled HTTPS root origin and has no
end-user override; missing configuration fails push setup before any real
quote or wallet output is requested.

Browser/WASM builds retain the RPC types but cannot construct a push-gateway
client: they have no native FCM installation and their Fetch-backed `reqwest`
transport cannot enforce the no-redirect, bounded-streaming contract above.
They therefore return the same sanitized unavailable result before any gateway
request, quote, or wallet output instead of weakening that boundary.

Installation registration is deliberately independent of FI selection and may
happen before a quote exists. It proves only recipient-key possession plus a
gateway-validated Fedi-project FCM token, never a human identity or financial
authority. Push payloads therefore contain only a generic FI workflow/action.
They must not contain or authorize payment, progress, an invite code, a
federation mutation, or any decision. On tap, the UI reopens the FI surface and
uses authoritative status/recovery to choose the closest durable state.
The exact routing fields are governed in `HACKING.md` and implemented by the
single strict parser in `ui/common/utils/fiPush.ts`; consumers must not create a
second string contract.

At `Pay & create`, the bridge creates one installation-scoped, one-use,
30-day hook before entering Manifold's paid operation. The callback is passed
only through the callback-aware `pay_and_create` method, which must persist it
in the formation initialization transaction before external effects. A later
setter is forbidden. Fedi does not duplicate the callback in its database; a
crash before Manifold initialization can leave only an expiring gateway orphan.
Once a formation exists, Manifold is the sole durable owner and gateway failure
must never roll back money or DKG. A hook may be revoked by Fedi only after the
driver proves no durable formation owns it.
The gateway response is accepted only when `expires_at == created_at + 30 days`
without integer overflow and `created_at` is fresh relative to the bridge's
trusted request-start/response-receive timestamps. The permitted gateway clock
skew is five minutes in either direction; stale, excessively future-dated, or
locally reversed request/response timestamps fail closed. Exact recipient,
installation, one-use, notification, routing, future expiry, and callback
origin/path checks also apply. A missing, shorter, longer, overflowing,
malformed, stale, future-dated, or cross-origin capability fails before paid
dispatch.

The bridge retains the same validated callback across a safe payer retry. For
an observed driver response, the driver returns its global operation claim to
the callback coordinator, which releases it only after callback ownership and
best-effort cleanup are settled. If the RPC caller disappears before that
handoff, the driver still completes; the next preview must consult
authoritative `fi-client` formation status before it may revoke the abandoned
local hook. Pre-initialization terminal cleanup is best-effort, while any
durable formation status forbids revocation. Executable production-coordinator
and fake-gateway tests cover response handoff, caller-loss recovery, safe payer
retry, and both sides of this ownership boundary.

Every selected federation manager receives the same callback and stable
idempotency key.
Gateway idempotency must survive for at least the hook's terminal lifetime so
delayed/restarted guardians cannot enqueue a second push after event cleanup.
Federation-manager and `fi-client` storage must erase the live bearer from
their logical records as soon as their respective recovery ownership ends,
while treating database pages, WAL, and backups as sensitive until normal
storage retention or compaction removes historical bytes. Retryable delivery
failures use bounded backoff; definitive gateway lifecycle/policy rejection
clears the federation manager's capability into a non-secret terminal outcome.
Missing/mismatched operator
origin is blocked configuration, not proof of terminal rejection: retain the
redacted capability without a request loop until configuration is restored or
explicitly migrated.
