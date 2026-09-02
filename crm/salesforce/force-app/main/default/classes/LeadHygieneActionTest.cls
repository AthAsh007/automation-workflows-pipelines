/**
 * Tests for the Flow action.
 *
 * The bulk test is the one that matters. A class that passes on one record and
 * fails on 200 is the standard Salesforce production incident, and 75% coverage
 * from single-record tests will not catch it.
 */
@isTest
private class LeadHygieneActionTest {

    @isTest
    static void handlesTwoHundredRecordsInOneTransaction() {
        List<Lead> records = new List<Lead>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new Lead(FirstName='  A' + i, LastName=' B' + i + ' ',
                                 Company='  Co ' + i,
                                 Email='PERSON' + i + '@Acme.Example',
                                 Website='https://www.acme.example/x'));
        }
        insert records;

        List<LeadHygieneAction.Request> reqs = new List<LeadHygieneAction.Request>();
        for (Lead record : records) {
            LeadHygieneAction.Request r = new LeadHygieneAction.Request();
            r.record = record;
            r.commitChanges = true;
            reqs.add(r);
        }

        Test.startTest();
        List<LeadHygieneAction.Result> results = LeadHygieneAction.run(reqs);
        Test.stopTest();

        System.assertEquals(200, results.size(), 'one result per input, in order');
        System.assert(Limits.getQueries() < Limits.getLimitQueries(),
            'no SOQL was issued per record');
        for (LeadHygieneAction.Result res : results) {
            System.assert(res.success, res.message);
            System.assert(res.autoFixedCount > 0, 'every record had something to fix');
        }
        Lead reloaded = [SELECT Email, Website FROM Lead WHERE Id = :records[0].Id];
        System.assertEquals('person0@acme.example', reloaded.Email);
        System.assertEquals('acme.example', reloaded.Website);
    }

    @isTest
    static void previewModeChangesNothingInTheDatabase() {
        Lead record = new Lead(LastName=' Trailing ', Company='Co',
                               Email='UPPER@Acme.Example');
        insert record;

        LeadHygieneAction.Request r = new LeadHygieneAction.Request();
        r.record = record;
        r.commitChanges = false;                 // the shipped default

        Test.startTest();
        List<LeadHygieneAction.Result> results = LeadHygieneAction.run(
            new List<LeadHygieneAction.Request>{r});
        Test.stopTest();

        System.assert(results[0].autoFixedCount > 0, 'corrections were computed');
        Lead reloaded = [SELECT LastName, Email FROM Lead WHERE Id = :record.Id];
        System.assertEquals(' Trailing ', reloaded.LastName, 'and not written');
        System.assertEquals('UPPER@Acme.Example', reloaded.Email);
    }

    @isTest
    static void resultOrderMatchesInputOrderEvenWhenARecordIsNull() {
        LeadHygieneAction.Request good = new LeadHygieneAction.Request();
        good.record = new Lead(LastName='Real', Company='Co');
        LeadHygieneAction.Request empty = new LeadHygieneAction.Request();  // no record

        List<LeadHygieneAction.Result> results = LeadHygieneAction.run(
            new List<LeadHygieneAction.Request>{empty, good, empty});

        System.assertEquals(3, results.size(),
            'a skipped record still produces a result, or Flow misaligns every row after it');
        System.assert(!results[0].success);
        System.assert(results[1].success);
        System.assert(!results[2].success);
    }

    @isTest
    static void reportsWhatNeedsAHumanWithoutChangingIt() {
        LeadHygieneAction.Request r = new LeadHygieneAction.Request();
        r.record = new Lead(LastName='X', Email='info@gmail.com');   // no company
        List<LeadHygieneAction.Result> results = LeadHygieneAction.run(
            new List<LeadHygieneAction.Request>{r});
        System.assert(results[0].needsReview.size() >= 2,
            'role address, free-mail domain and missing company are all reported');
        System.assertEquals(null, r.record.Company, 'and none of them are guessed at');
    }
}
