/**
 * rlmAssetMonthlyUsage.js
 *
 * Lightning Web Component that displays month-by-month usage for a Revenue Cloud
 * Asset, grouped by Usage Resource (and the entitled Product). One table per
 * resource, one row per month from first activity through the current month,
 * showing three figures using a running-balance model:
 *
 *   1. Total available    — carried-in unused units + grants issued that month
 *   2. Effective consumed — units consumed that month
 *   3. Carried over       — unused units rolled forward to the next month
 *
 * Public API:
 *  - recordId: Asset Id (set automatically on Asset record pages)
 */
import { LightningElement, api, wire } from 'lwc';

import getMonthlyUsageForAsset from '@salesforce/apex/RLM_UsageUploaderController.getMonthlyUsageForAsset';

export default class RlmAssetMonthlyUsage extends LightningElement {
    @api recordId;

    // Internal state
    resourceEntries = [];
    dataLoaded = false;

    // ─── Wire Adapter ─────────────────────────────────────────────────

    @wire(getMonthlyUsageForAsset, { assetId: '$recordId' })
    wiredMonthlyUsage({ data, error }) {
        if (data) {
            this.resourceEntries = data;
            this.dataLoaded = true;
        } else if (error) {
            this.resourceEntries = [];
            this.dataLoaded = true;
        }
    }

    // ─── Computed Properties ──────────────────────────────────────────

    get isLoading() {
        return !this.dataLoaded;
    }

    get hasData() {
        return this.resourceEntries.length > 0;
    }

    get noData() {
        return !this.isLoading && !this.hasData;
    }

    /**
     * Resources with their monthly rows formatted for display.
     */
    get resources() {
        return this.resourceEntries.map((res, resIdx) => ({
            id: res.resourceId || `resource-${resIdx}`,
            name: res.resourceName || 'Usage Resource',
            productName: res.productName || '',
            hasProduct: !!res.productName,
            uomLabel: res.uomName ? `(${res.uomName})` : '',
            months: (res.months || []).map((m) => ({
                key: `${res.resourceId || resIdx}-${m.monthKey}`,
                monthLabel: m.monthLabel,
                available: this._formatNumber(m.available),
                consumed: this._formatNumber(m.consumed),
                carriedOver: this._formatNumber(m.carriedOver)
            }))
        }));
    }

    // ─── Formatting Helpers ───────────────────────────────────────────

    /**
     * Formats a numeric value with locale grouping. Returns an em dash for null/undefined.
     */
    _formatNumber(num) {
        if (num === null || num === undefined || Number.isNaN(num)) {
            return '—';
        }
        return new Intl.NumberFormat().format(num);
    }
}
