# Usage Management Domain

22 objects managing usage entitlements, grants, metering, rating policies, and consumption tracking.

## Core Design-Time Objects

| Object | Purpose | Key Fields |
|--------|---------|-----------|
| `UsageResource` | Defines a usage resource (API calls, storage, data, etc.) | Code (unique), UsageDefinitionProductId (→ Product2), TokenResourceId (self-ref), UnitOfMeasureClassId, UsageResourceBillingPolicyId |
| `ProductUsageResource` (PUR) | Binds a Product to a UsageResource | ProductId, UsageResourceId, TokenResourceId |
| `ProductUsageResourcePolicy` (PURP) | Policy config for a PUR | ProductUsageResourceId, RatingFrequencyPolicyId, UsageAggregationPolicyId, UsageCommitmentPolicyId, UsageOveragePolicyId |
| `ProductUsageGrant` (PUG) | Entitlement grant for a product/resource | ProductUsageResourceId, UsageResourceId, RenewalPolicyId, RolloverPolicyId, UnitOfMeasureClassId, UnitOfMeasureId |
| `UsageResourceBillingPolicy` | Billing policy for usage resources | Code |

## Policy Objects

| Object | Purpose | Key Fields |
|--------|---------|-----------|
| `RatingFrequencyPolicy` | How often to rate usage | RatingPeriod, ProductId, UsageResourceId |
| `UsageCommitmentPolicy` | Commitment/minimum usage rules | Name |
| `UsageOveragePolicy` | Overage handling rules | Name |
| `UsageGrantRenewalPolicy` | Grant renewal rules | Code, UsageSummaryId |
| `UsageGrantRolloverPolicy` | Unused grant rollover rules | Code |
| `UsagePrdGrantBindingPolicy` | Binding policy for grants | Name, Product2Id |
| `UsageResourcePolicy` | Aggregate policy binding | UsageAggregationPolicyId, UsageCommitmentPolicyId, UsageOveragePolicyId |

## Runtime Objects

| Object | Purpose | Key Fields |
|--------|---------|-----------|
| `UsageSummary` | Aggregated usage per resource | UsageResourceId (self-ref for hierarchy) |
| `TransactionJournal` | Individual usage event/transaction | UsageResourceId |
| `UsageEntitlementBucket` | Entitlement balance tracking | BucketBalanceUomId |
| `UsageEntitlementEntry` | Individual entries against buckets | ParentEntitlementBucketId, TransactionUsageEntitlementId, TransactionalBucketId |
| `UsageEntitlementAccount` | Account-level entitlement tracking | — |
| `BindingObjUsageRsrcPlcy` (BOURP) | Per-account materialized policy binding, **auto-generated at sale time by copying the PURP** | BindingObjectId (→ Account/Asset/Contract), UsageResourceId, RatingFrequencyPolicyId, UsageAggregationPolicyId (→ UsageResourceBillingPolicy), UsageCommitmentPolicyId, UsageOveragePolicyId, DrawdownOrder |
| `TransactionUsageEntitlement` | Entitlement context for transactions | UsageCommitmentPolicyId, UsageOveragePolicyId |
| `UsageBillingPeriodItem` | Usage billing period tracking | — |
| `UsageRatableSummary` | Ratable usage summary | — |
| `UsageCmtAssetRelatedObj` | Commitment asset linkage | UsageResourceId |
| `UsageRatableSumCmtAssetRt` | Ratable summary commitment | UsageResourceId |

## Unit of Measure Objects

| Object | Purpose | Key Fields |
|--------|---------|-----------|
| `UnitOfMeasure` | Individual unit (Each, GB, Hour, etc.) | UnitCode (unique) |
| `UnitOfMeasureClass` | Groups related units (Data, Time, etc.) | Code (unique), BaseUnitOfMeasureId, DefaultUnitOfMeasureId |

## Key Relationships

```
UsageResource ← ProductUsageResource (UsageResourceId)
Product2 ← ProductUsageResource (ProductId)
ProductUsageResource ← ProductUsageResourcePolicy (ProductUsageResourceId)
ProductUsageResource ← ProductUsageGrant (ProductUsageResourceId)
UsageResource ← ProductUsageGrant (UsageResourceId)
UsageGrantRenewalPolicy ← ProductUsageGrant (RenewalPolicyId)
UsageGrantRolloverPolicy ← ProductUsageGrant (RolloverPolicyId)
UnitOfMeasureClass ← ProductUsageGrant (UnitOfMeasureClassId)
UnitOfMeasureClass ← UsageResource (UnitOfMeasureClassId)
UsageResource ← UsageResource (TokenResourceId, self-ref)
UsageResource ← TransactionJournal (UsageResourceId)
UsageResource ← UsageSummary (UsageResourceId)
UsageResourceBillingPolicy ← UsageResource (UsageResourceBillingPolicyId)
UnitOfMeasure ← UnitOfMeasureClass (BaseUnitOfMeasureId, DefaultUnitOfMeasureId)
```

## Activation Order

Rating objects require careful activation ordering:

1. Load UnitOfMeasure and UnitOfMeasureClass
2. Load UsageResource and policies
3. Load ProductUsageResource (PUR) — Insert + deleteOldData
4. Load ProductUsageResourcePolicy (PURP) — Insert + deleteOldData
5. Load ProductUsageGrant (PUG) — Insert + deleteOldData
6. Activate UnitOfMeasureClass and UsageResource (Pass 2)
7. Run `activateRatingRecords.apex` for PUR/PUG activation

## SFDMU Data Plan: `qb-rating`

16 objects across 2 passes. Upstream: `qb-pcm` (Product2, UoM, UoMClass), `qb-billing` (UsageResourceBillingPolicy).

PUR, PURP, and PUG use `Insert` + `deleteOldData: true` due to SFDMU v5 Bug 3 (relationship-traversal externalIds never match on Upsert).

## Setting Up a Usage-Based Product (config runbook)

Config records you create, in build order:

1. **Policies** (reusable): `RatingFrequencyPolicy` (drives the accumulation
   period), `UsageResourceBillingPolicy` (the "Usage Aggregation Policy"),
   `UsageCommitmentPolicy`, and optionally `UsageOveragePolicy`.
2. **Resource + product**: `UsageResource`, `Product2`, then
   `ProductUsageResource` (PUR) linking them.
3. **`ProductUsageResourcePolicy` (PURP)** — attaches the Phase-1 policies to
   the PUR. **This is the template every sale copies from.**
4. **Pricing**: `ProductSellingModel`, `PricebookEntry`, rate cards.

At sale time the runtime **auto-generates** `UsageEntitlementAccount`,
`UsageEntitlementBucket`, and `BindingObjUsageRsrcPlcy` (BOURP) — do **not**
create these by hand. The runtime **copies the PURP's policies into the BOURP**
per account × resource.

> These objects are **not writable** through the `quantum20-rca-sobject-all`
> MCP tools (several return `sObject type 'X' is not supported`); setup is done
> in the Salesforce UI or via the `qb-rating` SFDMU plan.

### PURP vs BOURP

| | `ProductUsageResourcePolicy` (PURP) | `BindingObjUsageRsrcPlcy` (BOURP) |
|---|---|---|
| Attaches to | Product ↔ Usage Resource (the PUR) | Account/Asset ↔ Usage Resource |
| Scope | the product (all buyers) | one customer's provisioned entitlement |
| Who creates it | **you**, at config time (template) | **the system**, at sale time (copy) |

### Root cause: the "1970 / Unix epoch" accumulation-period bug

**Symptom:** the `SummaryCreation` batch ("Create Empty Summaries", process
group *Usage Management*) fails with
`The value "{UsageEntitlementAccount}::{UsageResource}" for the
UsageAccumulationPeriod parameter is invalid`, and new entitlements have a
billing period stuck at **1/1/1970**.

**Cause:** the product's PURP is missing or has no Rating Frequency /
Aggregation policy, so the auto-generated BOURP is **born blank** and the
accumulation period defaults to epoch.

**Do NOT rely on** `UsageResource.UsageResourceBillingPolicyId` — that field is
**deprecated and ignored by the runtime**.

**Minimum per usage product:** a `UsageResource`, a `ProductUsageResource`
linking it to the `Product2`, and a `ProductUsageResourcePolicy` on that PUR
with **both** a Rating Frequency Policy and an Aggregation Policy set.

**Fixing an already-broken product:** the PURP fix corrects only **future**
sales. Accounts sold before the PURP existed keep their blank BOURP and must be
re-provisioned, or manually patched by editing the existing
`BindingObjUsageRsrcPlcy` record's policy fields.
