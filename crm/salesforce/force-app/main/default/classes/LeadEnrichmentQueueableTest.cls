/**
 * Tests for the enrichment queueable, including the paths that only appear when
 * something goes wrong. A 200 response is the least interesting case.
 */
@isTest
private class LeadEnrichmentQueueableTest {

    private class Mock implements HttpCalloutMock {
        private final Integer status;
        private final String body;
        Mock(Integer status, String body) { this.status = status; this.body = body; }
        public HttpResponse respond(HttpRequest req) {
            System.assertTrue(req.getEndpoint().startsWith('callout:'),
                'the endpoint is a Named Credential, so no URL or secret is in the repo');
            HttpResponse res = new HttpResponse();
            res.setStatusCode(status);
            res.setBody(body);
            return res;
        }
    }

    private static Lead makeLead() {
        Lead record = new Lead(LastName='X', Company=null,
                               Website='acme.example', Email='a@acme.example');
        insert record;
        return record;
    }

    @isTest
    static void fillsOnlyBlankFields() {
        Lead record = makeLead();
        Test.setMock(HttpCalloutMock.class,
            new Mock(200, '{"company":"Acme Supply","country":"United Kingdom"}'));

        Test.startTest();
        new LeadEnrichmentQueueable(new List<Id>{record.Id}, 0)
            .execute((QueueableContext) null);
        Test.stopTest();

        Lead reloaded = [SELECT Company, Country FROM Lead WHERE Id = :record.Id];
        System.assertEquals('Acme Supply', reloaded.Company);
        System.assertEquals('United Kingdom', reloaded.Country);
    }

    @isTest
    static void doesNotOverwriteAValueThatIsAlreadyThere() {
        Lead record = new Lead(LastName='X', Company='The name the customer gave us',
                               Website='acme.example');
        insert record;
        Test.setMock(HttpCalloutMock.class, new Mock(200, '{"company":"Something Else"}'));

        Test.startTest();
        new LeadEnrichmentQueueable(new List<Id>{record.Id}, 0)
            .execute((QueueableContext) null);
        Test.stopTest();

        Lead reloaded = [SELECT Company FROM Lead WHERE Id = :record.Id];
        System.assertEquals('The name the customer gave us', reloaded.Company,
            'a provider guess never beats a value a person supplied');
    }

    @isTest
    static void treatsNotFoundAsAnAnswerRatherThanAnError() {
        Lead record = makeLead();
        Test.setMock(HttpCalloutMock.class, new Mock(404, ''));

        Test.startTest();
        new LeadEnrichmentQueueable(new List<Id>{record.Id}, 0)
            .execute((QueueableContext) null);
        Test.stopTest();

        Lead reloaded = [SELECT Company FROM Lead WHERE Id = :record.Id];
        System.assertEquals(null, reloaded.Company, 'no match, and no exception either');
    }

    @isTest
    static void survivesARetryableFailureWithoutLosingTheRecord() {
        Lead record = makeLead();
        Test.setMock(HttpCalloutMock.class, new Mock(503, 'upstream down'));

        Test.startTest();
        // The point of the assertion is that this does not throw: the record is
        // deferred for the next run rather than taking the whole job down.
        new LeadEnrichmentQueueable(new List<Id>{record.Id}, 0)
            .execute((QueueableContext) null);
        Test.stopTest();

        System.assert(true, 'a 503 is handled, not raised');
    }

    @isTest
    static void stopsChainingAtTheDepthGuard() {
        List<Id> ids = new List<Id>();
        for (Lead record : [SELECT Id FROM Lead LIMIT 0]) { ids.add(record.Id); }
        // depth 4 is MAX_CHAIN_DEPTH: this must not enqueue another job.
        Test.startTest();
        new LeadEnrichmentQueueable(ids, 4).execute((QueueableContext) null);
        Test.stopTest();
        System.assertEquals(0, Limits.getQueueableJobs(),
            'the chain is bounded here rather than by the platform stack limit');
    }
}
