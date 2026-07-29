/**
 * RLM_PriceHistoryControllerTest
 *
 * Coverage for RLM_PriceHistoryController. PricebookEntryHistory rows are system-managed and
 * cannot be inserted in a test, so the change-timeline branch can't be exercised directly.
 * These tests cover the reachable paths: a null id, and an entry with no tracked changes
 * (which returns a single point at the current price). The wrapper classes are instantiated
 * for field coverage.
 */
@IsTest
private class RLM_PriceHistoryControllerTest {
    @IsTest
    static void testGetPriceHistory_NullId() {
        Test.startTest();
        RLM_PriceHistoryController.PriceHistoryWrapper w = RLM_PriceHistoryController.getPriceHistoryForEntry(
            null
        );
        Test.stopTest();
        System.assertEquals(null, w, 'A null id should return a null wrapper.');
    }

    @IsTest
    static void testGetPriceHistory_NoChanges() {
        Product2 prod = new Product2(Name = 'Test Chart Product', IsActive = true);
        insert prod;

        Id stdPricebookId = Test.getStandardPricebookId();
        PricebookEntry pbe = new PricebookEntry(
            Pricebook2Id = stdPricebookId,
            Product2Id = prod.Id,
            UnitPrice = 500,
            IsActive = true
        );
        insert pbe;

        Test.startTest();
        RLM_PriceHistoryController.PriceHistoryWrapper w = RLM_PriceHistoryController.getPriceHistoryForEntry(
            pbe.Id
        );
        Test.stopTest();

        System.assertNotEquals(null, w, 'Wrapper should be returned for a real entry.');
        System.assertEquals(500, w.currentPrice, 'Current price should match the entry.');
        System.assertNotEquals(null, w.currencyCode, 'A currency code should be resolved.');
        System.assertEquals(1, w.points.size(), 'No history → a single current-price point.');
        System.assertEquals(500, w.points[0].price, 'The single point should hold the current price.');
        System.assertEquals(true, w.points[0].isCreation, 'The single point is the creation point.');
    }

    @IsTest
    static void testWrapperInstantiation() {
        RLM_PriceHistoryController.PriceHistoryWrapper w = new RLM_PriceHistoryController.PriceHistoryWrapper();
        w.productName = 'Widget';
        w.pricebookName = 'Standard Price Book';
        w.currencyCode = 'USD';
        w.currentPrice = 199;
        w.points = new List<RLM_PriceHistoryController.PricePoint>();

        RLM_PriceHistoryController.PricePoint p = new RLM_PriceHistoryController.PricePoint();
        p.timeMillis = 1000L;
        p.dateLabel = 'Jul 21, 2026';
        p.price = 199;
        p.previousPrice = 189;
        p.changedBy = 'Brigitte Zillmann';
        p.isCreation = false;
        w.points.add(p);

        System.assertEquals(1, w.points.size(), 'Point should be added.');
        System.assertEquals(189, w.points[0].previousPrice, 'previousPrice should round-trip.');
    }
}
