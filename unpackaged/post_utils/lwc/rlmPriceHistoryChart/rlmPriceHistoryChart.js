/**
 * rlmPriceHistoryChart.js
 *
 * Visualizes the list-price history of a PricebookEntry as a step-line chart. List price is a
 * step function — each value holds until the next change — so the line steps horizontally to the
 * change date, then vertically to the new price, and the final level extends to "now".
 *
 * Data comes from RLM_PriceHistoryController.getPriceHistoryForEntry, which reconstructs the
 * timeline from Price Book Entry field history. Rendered as hand-built SVG (no charting library)
 * so it deploys with nothing but the bundle. All geometry is computed here; the template draws it.
 *
 * Public API:
 *  - recordId: PricebookEntry Id (set automatically on Price Book Entry record pages)
 */
import { LightningElement, api, wire } from 'lwc';

import getPriceHistoryForEntry from '@salesforce/apex/RLM_PriceHistoryController.getPriceHistoryForEntry';

// ─── Chart geometry (SVG user units) ──────────────────────────────────
const PLOT_H = 170; // height of the plot area
const TOP = 16; // top padding above the highest point
const BOTTOM = 34; // room below the baseline for date labels
const LEFT = 64; // room left of the plot for y-axis price labels
const RIGHT = 24; // right padding (room for the "Now" label)
const PLOT_W = 520; // width of the plot area

export default class RlmPriceHistoryChart extends LightningElement {
    @api recordId;

    wrapper;
    dataLoaded = false;

    // ─── Wire Adapter ─────────────────────────────────────────────────

    @wire(getPriceHistoryForEntry, { pricebookEntryId: '$recordId' })
    wiredHistory({ data, error }) {
        if (data) {
            this.wrapper = data;
            this.dataLoaded = true;
        } else if (error) {
            this.wrapper = undefined;
            this.dataLoaded = true;
        }
    }

    // ─── State getters ────────────────────────────────────────────────

    get isLoading() {
        return !this.dataLoaded;
    }

    get hasData() {
        return !!(this.wrapper && this.wrapper.points && this.wrapper.points.length);
    }

    get noData() {
        return !this.isLoading && !this.hasData;
    }

    get productName() {
        return this.wrapper ? this.wrapper.productName : '';
    }

    get pricebookName() {
        return this.wrapper ? this.wrapper.pricebookName : '';
    }

    get currentPriceLabel() {
        return this.wrapper ? this._money(this.wrapper.currentPrice) : '';
    }

    // ─── Chart model ──────────────────────────────────────────────────

    get chart() {
        if (!this.hasData) {
            return null;
        }
        const points = this.wrapper.points.filter((p) => p.price !== null && p.price !== undefined);
        if (!points.length) {
            return null;
        }

        const n = points.length;
        const baselineY = TOP + PLOT_H;
        const rightEdge = LEFT + PLOT_W;
        const svgWidth = LEFT + PLOT_W + RIGHT;
        const svgHeight = TOP + PLOT_H + BOTTOM;

        // X: proportional to time, extended to "now" so the current price visibly holds.
        const tMin = points[0].timeMillis;
        const tLast = points[n - 1].timeMillis;
        const now = Date.now();
        const tEnd = Math.max(tLast, now);
        const tSpan = tEnd - tMin;
        const xFor = (i) => {
            if (tSpan > 0) {
                return LEFT + ((points[i].timeMillis - tMin) / tSpan) * PLOT_W;
            }
            return LEFT + (n > 1 ? i / (n - 1) : 0) * PLOT_W;
        };

        // Y: padded around the observed price range (line chart, so a non-zero baseline is fine;
        // gridline labels make the scale explicit).
        let pMin = Infinity;
        let pMax = -Infinity;
        points.forEach((p) => {
            const v = Number(p.price);
            pMin = Math.min(pMin, v);
            pMax = Math.max(pMax, v);
        });
        const range = pMax - pMin;
        const pad = range > 0 ? range * 0.15 : Math.abs(pMax) * 0.1 || 1;
        const axisMin = Math.max(0, pMin - pad);
        let axisMax = pMax + pad;
        if (axisMax === axisMin) {
            axisMax = axisMin + 1;
        }
        const yFor = (v) => TOP + PLOT_H - ((v - axisMin) / (axisMax - axisMin)) * PLOT_H;

        // Step-after line + filled area under it.
        const x0 = xFor(0);
        const y0 = yFor(Number(points[0].price));
        let line = `M ${x0} ${y0}`;
        let area = `M ${x0} ${baselineY} L ${x0} ${y0}`;
        for (let i = 1; i < n; i++) {
            const xi = xFor(i);
            const yi = yFor(Number(points[i].price));
            line += ` H ${xi} V ${yi}`;
            area += ` H ${xi} V ${yi}`;
        }
        line += ` H ${rightEdge}`;
        area += ` H ${rightEdge} L ${rightEdge} ${baselineY} Z`;

        // Markers, value labels, date labels.
        const markers = [];
        const valueLabels = [];
        const dateLabels = [];
        points.forEach((p, i) => {
            const x = xFor(i);
            const y = yFor(Number(p.price));
            const priceStr = this._money(p.price);
            const title = p.isCreation
                ? `Created ${p.dateLabel} · ${priceStr}`
                : `${p.dateLabel} · ${this._money(p.previousPrice)} → ${priceStr}${p.changedBy ? ' · ' + p.changedBy : ''}`;
            markers.push({ key: `m-${i}`, cx: x, cy: y, title });
            valueLabels.push({ key: `v-${i}`, x, y: y - 10, text: priceStr });
            dateLabels.push({ key: `d-${i}`, x, y: baselineY + 16, text: p.dateLabel });
        });

        // Y gridlines: min / mid / max.
        const gridlines = [axisMin, (axisMin + axisMax) / 2, axisMax].map((v, idx) => {
            const y = yFor(v);
            return {
                key: `g-${idx}`,
                x1: LEFT,
                x2: rightEdge,
                y,
                labelX: LEFT - 8,
                labelY: y + 4,
                label: this._moneyShort(v)
            };
        });

        return {
            svgWidth,
            svgHeight,
            viewBox: `0 0 ${svgWidth} ${svgHeight}`,
            line,
            area,
            markers,
            valueLabels,
            dateLabels,
            gridlines,
            baselineY,
            nowX: rightEdge,
            nowY: baselineY + 16,
            ariaLabel: `List price over time for ${this.productName || 'this price book entry'}`
        };
    }

    // ─── Formatting helpers ───────────────────────────────────────────

    _formatter(maxFractionDigits) {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: (this.wrapper && this.wrapper.currencyCode) || 'USD',
            maximumFractionDigits: maxFractionDigits
        });
    }

    _money(v) {
        if (v === null || v === undefined || Number.isNaN(Number(v))) {
            return '—';
        }
        return this._formatter(2).format(Number(v));
    }

    _moneyShort(v) {
        if (v === null || v === undefined || Number.isNaN(Number(v))) {
            return '—';
        }
        return this._formatter(0).format(Number(v));
    }
}
