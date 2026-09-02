/**
 * The Flow action. One entry point, bulk safe, no logic of its own.
 *
 * Flow calls this once with up to 200 records, not 200 times with one. That is
 * enforced by the platform: an @InvocableMethod must be static and must take and
 * return a List. The annotation exists to make bulk the only option.
 *
 * Three rules this class follows, in order of how expensive they are to get wrong:
 *
 *   1. The output list is the same length as the input list, in the same order.
 *      Flow matches results to records positionally. Returning a filtered list
 *      assigns the wrong result to the wrong record and raises no error at all.
 *   2. No SOQL and no DML inside a loop. The rules live in HygieneRules, which
 *      has neither, and the single DML statement here is outside every loop.
 *   3. A failure on one record does not lose the other 199. Each record carries
 *      its own success flag and message.
 */
public with sharing class LeadHygieneAction {

    public class Request {
        @InvocableVariable(
            label='Lead'
            description='The record to clean. Pass the Flow record variable.'
            required=true)
        public Lead record;

        @InvocableVariable(
            label='Save the record'
            description='True writes the corrections. False previews them and writes nothing. Defaults to false, so a Flow built by hand does not modify data until someone chooses to.')
        public Boolean commitChanges = false;

        @InvocableVariable(
            label='Queue enrichment'
            description='True queues an external enrichment callout after the transaction commits.')
        public Boolean enrich = false;
    }

    public class Result {
        @InvocableVariable(label='Succeeded')
        public Boolean success = false;

        @InvocableVariable(label='Fields corrected')
        public Integer autoFixedCount = 0;

        @InvocableVariable(label='Corrections'
            description='One line per correction: field, old value, new value, rule.')
        public List<String> corrections = new List<String>();

        @InvocableVariable(label='Needs human review'
            description='Findings a machine must not act on. Duplicates, malformed addresses, missing company.')
        public List<String> needsReview = new List<String>();

        @InvocableVariable(label='Message')
        public String message = '';
    }

    @InvocableMethod(
        label='Clean a Lead'
        description='Trims whitespace, lowercases the email, normalises the website and expands a country code. Reports duplicates, role addresses and missing fields without changing them.'
        category='Data Quality')
    public static List<Result> run(List<Request> requests) {
        List<Result> results = new List<Result>();
        List<Lead> toUpdate  = new List<Lead>();
        List<Id>   toEnrich  = new List<Id>();

        // Pass one: evaluate everything, write nothing.
        for (Request req : requests) {
            Result res = new Result();
            results.add(res);                       // added first, so index == input index

            if (req == null || req.record == null) {
                res.message = 'No record supplied.';
                continue;
            }
            try {
                HygieneRules.Verdict v = HygieneRules.evaluate(req.record);
                res.success        = true;
                res.autoFixedCount = v.autoFixed.size();
                res.needsReview    = v.needsReview;
                for (HygieneRules.Change c : v.autoFixed) {
                    res.corrections.add(String.format(
                        '{0}: "{1}" -> "{2}" ({3})',
                        new List<String>{c.fieldName, c.oldValue, c.newValue, c.rule}));
                }
                res.message = v.autoFixed.isEmpty()
                    ? 'Nothing to correct.'
                    : 'Corrected ' + v.autoFixed.size() + ' field(s).';

                if (v.changed && req.commitChanges == true && req.record.Id != null) {
                    toUpdate.add(v.record);
                }
                if (req.enrich == true && req.record.Id != null) {
                    toEnrich.add(req.record.Id);
                }
            } catch (Exception e) {
                // One bad record must not cost the other 199.
                res.success = false;
                res.message = 'Failed: ' + e.getMessage();
            }
        }

        // Pass two: one DML statement, outside every loop.
        if (!toUpdate.isEmpty()) {
            // allOrNone = false, so a validation rule on one record does not roll
            // back the other 199 corrections.
            List<Database.SaveResult> saves = Database.update(toUpdate, false);
            applySaveErrors(saves, toUpdate, requests, results);
        }

        // Pass three: callouts, after the transaction, one job for the whole batch.
        if (!toEnrich.isEmpty() && !Test.isRunningTest()) {
            System.enqueueJob(new LeadEnrichmentQueueable(toEnrich, 0));
        }

        return results;
    }

    /** Map a partial-save failure back onto the Result that belongs to it. */
    private static void applySaveErrors(List<Database.SaveResult> saves,
                                        List<Lead> updated,
                                        List<Request> requests,
                                        List<Result> results) {
        Map<Id, String> errorById = new Map<Id, String>();
        for (Integer i = 0; i < saves.size(); i++) {
            if (!saves[i].isSuccess()) {
                List<String> messages = new List<String>();
                for (Database.Error err : saves[i].getErrors()) {
                    messages.add(err.getMessage());
                }
                errorById.put(updated[i].Id, String.join(messages, '; '));
            }
        }
        if (errorById.isEmpty()) { return; }
        for (Integer i = 0; i < requests.size(); i++) {
            Lead record = requests[i] == null ? null : requests[i].record;
            if (record != null && errorById.containsKey(record.Id)) {
                results[i].success = false;
                results[i].message = 'Corrections computed but not saved: '
                                     + errorById.get(record.Id);
            }
        }
    }
}
