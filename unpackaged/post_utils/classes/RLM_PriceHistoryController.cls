/**
 * RLM_PriceHistoryController
 *
 * Apex controller for the rlmPriceHistoryChart Lightning Web Component. Reconstructs the
 * list-price timeline of a PricebookEntry from its field history so the UI can draw a
 * step chart of how the price changed over time.
 *
 * List price is a step function — it holds until the next change — so the timeline is built
 * as an ordered series of "price points":
 *   - the initial price (the OldValue of the earliest tracked change, effective from creation),
 *   - one point per tracked UnitPrice change (its NewValue, at the change's timestamp).
 * When no changes are tracked, a single point at the current price is returned.
 *
 * Field-history tracking on Price Book Entry must be enabled for changes to appear.
 */
public with sharing class RLM_PriceHistoryController {
    /**
     * Returns the list-price timeline for a single PricebookEntry.
     *
     * @param pricebookEntryId Id of the PricebookEntry to chart
     * @return wrapper with header info and an ascending list of price points (null id → null)
     */
    @AuraEnabled(cacheable=true)
    public static PriceHistoryWrapper getPriceHistoryForEntry(Id pricebookEntryId) {
        if (pricebookEntryId == null) {
            return null;
        }

        List<PricebookEntry> entries = [
            SELECT Id, UnitPrice, CreatedDate, Product2.Name, Pricebook2.Name
            FROM PricebookEntry
            WHERE Id = :pricebookEntryId
            LIMIT 1
        ];
        if (entries.isEmpty()) {
            return null;
        }
        PricebookEntry pbe = entries[0];

        PriceHistoryWrapper w = new PriceHistoryWrapper();
        w.productName = pbe.Product2 != null ? pbe.Product2.Name : null;
        w.pricebookName = pbe.Pricebook2 != null ? pbe.Pricebook2.Name : null;
        w.currentPrice = pbe.UnitPrice;
        w.currencyCode = resolveCurrencyCode(pricebookEntryId);
        w.points = new List<PricePoint>();

        // Tracked list-price changes, oldest first.
        List<PricebookEntryHistory> history = [
            SELECT Field, OldValue, NewValue, CreatedDate, CreatedBy.Name
            FROM PricebookEntryHistory
            WHERE PricebookEntryId = :pricebookEntryId AND Field = 'UnitPrice'
            ORDER BY CreatedDate ASC
        ];

        if (history.isEmpty()) {
            // No tracked changes — a single point at the current price.
            w.points.add(buildPoint(pbe.CreatedDate, pbe.UnitPrice, null, null, true));
        } else {
            // The earliest change's OldValue is the price the entry was created with.
            Decimal initial = toDecimal(history[0].OldValue);
            w.points.add(buildPoint(pbe.CreatedDate, initial, null, null, true));
            for (PricebookEntryHistory h : history) {
                String changedBy = h.CreatedBy != null ? h.CreatedBy.Name : null;
                w.points.add(
                    buildPoint(
                        h.CreatedDate,
                        toDecimal(h.NewValue),
                        toDecimal(h.OldValue),
                        changedBy,
                        false
                    )
                );
            }
        }

        return w;
    }

    /**
     * Resolves the currency ISO code without a static CurrencyIsoCode reference, so the class
     * compiles and deploys in single-currency orgs too.
     */
    private static String resolveCurrencyCode(Id pricebookEntryId) {
        if (UserInfo.isMultiCurrencyOrganization()) {
            List<SObject> rows = Database.query(
                'SELECT CurrencyIsoCode FROM PricebookEntry WHERE Id = :pricebookEntryId'
            );
            if (!rows.isEmpty()) {
                return (String) rows[0].get('CurrencyIsoCode');
            }
        }
        return UserInfo.getDefaultCurrency();
    }

    private static PricePoint buildPoint(
        Datetime changedAt,
        Decimal price,
        Decimal previousPrice,
        String changedBy,
        Boolean isCreation
    ) {
        PricePoint p = new PricePoint();
        p.timeMillis = changedAt != null ? changedAt.getTime() : null;
        p.dateLabel = changedAt != null ? changedAt.format('MMM d, yyyy') : null;
        p.price = price;
        p.previousPrice = previousPrice;
        p.changedBy = changedBy;
        p.isCreation = isCreation;
        return p;
    }

    /** Field-history Old/NewValue is an anyType; coerce to Decimal (null-safe). */
    private static Decimal toDecimal(Object value) {
        if (value == null) {
            return null;
        }
        String s = String.valueOf(value);
        if (String.isBlank(s)) {
            return null;
        }
        return Decimal.valueOf(s);
    }

    /**
     * Wrapper: the price timeline for one PricebookEntry.
     */
    public class PriceHistoryWrapper {
        @AuraEnabled
        public String productName;
        @AuraEnabled
        public String pricebookName;
        @AuraEnabled
        public String currencyCode;
        @AuraEnabled
        public Decimal currentPrice;
        @AuraEnabled
        public List<PricePoint> points;
    }

    /**
     * Wrapper: one point on the price timeline.
     */
    public class PricePoint {
        @AuraEnabled
        public Long timeMillis; // ms since epoch, for time-proportional x positioning
        @AuraEnabled
        public String dateLabel; // e.g. "Jul 21, 2026"
        @AuraEnabled
        public Decimal price; // list price in effect from this point forward
        @AuraEnabled
        public Decimal previousPrice; // price before this change (null for the creation point)
        @AuraEnabled
        public String changedBy; // user who made the change (null for the creation point)
        @AuraEnabled
        public Boolean isCreation; // true for the synthetic initial/creation point
    }
}
