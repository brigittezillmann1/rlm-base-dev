/**
 * rlmAssetUsageChart.js
 *
 * Companion visualization to rlmAssetMonthlyUsage: instead of a table, it renders a
 * grouped vertical bar chart of Total Available vs Effective Consumed for each month,
 * one chart per Usage Resource. Reuses the same cacheable Apex method so both components
 * stay in sync.
 *
 * Rendered with hand-built SVG (no charting library / static resource) so it deploys with
 * nothing but the bundle. Bar geometry is computed here; the template just draws it.
 *
 * Public API:
 *  - recordId: Asset Id (set automatically on Asset record pages)
 */
import { LightningElement, api, wire } from 'lwc';

import getMonthlyUsageForAsset from '@salesforce/apex/RLM_UsageUploaderController.getMonthlyUsageForAsset';

// ─── Chart geometry (SVG user units) ──────────────────────────────────
const PLOT_H = 160; // height of the plot area
const TOP = 10; // top padding above the tallest bar
const BOTTOM = 30; // room below the baseline for month labels
const LEFT = 52; // room left of the plot for y-axis value labels
const RIGHT = 12; // right padding
const GROUP_W = 60; // horizontal space allotted to one month (both bars)
const BAR_W = 20; // width of a single bar
const BAR_GAP = 6; // gap between the two bars in a month

export default class RlmAssetUsageChart extends LightningElement {
    @api recordId;

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
     * Resources, each with a fully-resolved SVG chart model (bars, gridlines, labels).
     */
    get resources() {
        return this.resourceEntries.map((res, resIdx) => {
            const months = res.months || [];
            const baseId = res.resourceId || `resource-${resIdx}`;
            const uom = res.uomName ? ` ${res.uomName}` : '';

            // Scale: tallest of any available/consumed value across the resource's months.
            let maxVal = 0;
            months.forEach((m) => {
                maxVal = Math.max(
                    maxVal,
                    this._num(m.available),
                    this._num(m.consumed)
                );
            });
            const scaleMax = maxVal > 0 ? maxVal : 1;

            const baselineY = TOP + PLOT_H;
            const svgWidth = LEFT + months.length * GROUP_W + RIGHT;
            const svgHeight = TOP + PLOT_H + BOTTOM;

            const bars = [];
            const monthLabels = [];
            months.forEach((m, i) => {
                const available = this._num(m.available);
                const consumed = this._num(m.consumed);
                const groupX =
                    LEFT +
                    i * GROUP_W +
                    (GROUP_W - (2 * BAR_W + BAR_GAP)) / 2;

                const availH = (available / scaleMax) * PLOT_H;
                const consH = (consumed / scaleMax) * PLOT_H;

                bars.push({
                    key: `${baseId}-a-${m.monthKey}`,
                    x: groupX,
                    y: baselineY - availH,
                    width: BAR_W,
                    height: availH,
                    className: 'bar bar_available',
                    title: `${m.monthLabel} — Available: ${this._fmt(available)}${uom}`
                });
                bars.push({
                    key: `${baseId}-c-${m.monthKey}`,
                    x: groupX + BAR_W + BAR_GAP,
                    y: baselineY - consH,
                    width: BAR_W,
                    height: consH,
                    className: 'bar bar_consumed',
                    title: `${m.monthLabel} — Consumed: ${this._fmt(consumed)}${uom}`
                });

                monthLabels.push({
                    key: `${baseId}-lbl-${m.monthKey}`,
                    x: groupX + BAR_W + BAR_GAP / 2,
                    y: baselineY + 18,
                    text: m.monthLabel
                });
            });

            // Three horizontal reference lines: 0, half, and the scale max.
            const gridlines = [0, 0.5, 1].map((frac) => ({
                key: `${baseId}-grid-${frac}`,
                x1: LEFT,
                x2: svgWidth - RIGHT,
                y: baselineY - frac * PLOT_H,
                labelX: LEFT - 8,
                labelY: baselineY - frac * PLOT_H + 4,
                label: this._fmt(Math.round(scaleMax * frac))
            }));

            return {
                id: baseId,
                name: res.resourceName || 'Usage Resource',
                productName: res.productName || '',
                hasProduct: !!res.productName,
                uomLabel: res.uomName ? `(${res.uomName})` : '',
                ariaLabel: `Available versus consumed by month for ${res.resourceName || 'usage resource'}`,
                svgWidth,
                svgHeight,
                viewBox: `0 0 ${svgWidth} ${svgHeight}`,
                bars,
                gridlines,
                monthLabels
            };
        });
    }

    // ─── Helpers ──────────────────────────────────────────────────────

    _num(v) {
        return v === null || v === undefined || Number.isNaN(v) ? 0 : Number(v);
    }

    _fmt(num) {
        return new Intl.NumberFormat().format(num);
    }
}
