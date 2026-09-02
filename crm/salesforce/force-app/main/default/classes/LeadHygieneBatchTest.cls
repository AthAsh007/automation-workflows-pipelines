@isTest
private class LeadHygieneBatchTest {

    @isTest
    static void sweepsEveryStaleLeadAndCorrectsWhatIsSafe() {
        List<Lead> records = new List<Lead>();
        for (Integer i = 0; i < 250; i++) {
            records.add(new Lead(FirstName='  A' + i, LastName='B' + i,
                                 Company='  Co  ' + i,
                                 Email='PERSON' + i + '@Acme.Example',
                                 Website='https://www.acme.example/page'));
        }
        insert records;
        // The batch filters on LastModifiedDate, which is not writable, so the
        // test uses a zero-day staleness window instead of back-dating records.
        Test.startTest();
        Database.executeBatch(new LeadHygieneBatch(0), 200);
        Test.stopTest();

        Integer cleaned = [
            SELECT COUNT() FROM Lead WHERE Website = 'acme.example'
        ];
        System.assertEquals(250, cleaned,
            'every chunk was processed, not only the first 200');
    }

    @isTest
    static void schedulerEnqueuesTheBatch() {
        Test.startTest();
        String jobId = System.schedule('hygiene test', '0 0 20 ? * SUN',
                                       new LeadHygieneBatch.Scheduler());
        Test.stopTest();
        System.assertNotEquals(null, jobId);
        CronTrigger ct = [SELECT CronExpression FROM CronTrigger WHERE Id = :jobId];
        System.assertEquals('0 0 20 ? * SUN', ct.CronExpression);
    }
}
