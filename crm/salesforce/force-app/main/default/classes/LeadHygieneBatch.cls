/**
 * Weekly hygiene sweep over every Lead that has not been checked recently.
 *
 * Batch, rather than a Queueable or a Flow, because the record count is larger
 * than one transaction can hold. Each execute() gets its own governor limits, so
 * scope size is the lever: smaller scope means more transactions and more
 * headroom per transaction.
 *
 * Schedule it:
 *   System.schedule('Lead hygiene', '0 0 20 ? * SUN',
 *                   new LeadHygieneBatch.Scheduler());
 */
public with sharing class LeadHygieneBatch
        implements Database.Batchable<sObject>, Database.Stateful {

    // Stateful, so the totals survive across execute() calls and the finish()
    // email reports the whole run rather than the last chunk.
    private Integer scanned      = 0;
    private Integer corrected    = 0;
    private Integer flagged      = 0;
    private Integer failedSaves  = 0;
    private final List<String> reviewLines = new List<String>();

    private final Integer staleDays;

    public LeadHygieneBatch() { this(90); }
    public LeadHygieneBatch(Integer staleDays) {
        this.staleDays = staleDays == null ? 90 : staleDays;
    }

    public Database.QueryLocator start(Database.BatchableContext context) {
        Datetime cutoff = Datetime.now().addDays(-staleDays);
        // A QueryLocator, not a List: a List start() caps at 50,000 records.
        return Database.getQueryLocator([
            SELECT Id, FirstName, LastName, Company, Title, Email, Website,
                   Country, Phone, LastModifiedDate
            FROM Lead
            WHERE IsConverted = false
              AND LastModifiedDate < :cutoff
            ORDER BY LastModifiedDate ASC
        ]);
    }

    public void execute(Database.BatchableContext context, List<Lead> scope) {
        List<Lead> toUpdate = new List<Lead>();
        scanned += scope.size();

        for (Lead record : scope) {
            HygieneRules.Verdict v = HygieneRules.evaluate(record);
            if (v.changed) { toUpdate.add(v.record); }
            if (!v.needsReview.isEmpty()) {
                flagged++;
                // Cap the report. A run that flags 40,000 records should say so,
                // not try to email all of them.
                if (reviewLines.size() < 200) {
                    reviewLines.add(record.Id + ': ' + String.join(v.needsReview, '; '));
                }
            }
        }

        // Duplicates are reported, never resolved. Which record survives and
        // where its activities go is a decision with consequences.
        Map<String, List<Id>> dupes = HygieneRules.findDuplicateEmails(scope);
        for (String email : dupes.keySet()) {
            flagged++;
            if (reviewLines.size() < 200) {
                reviewLines.add('duplicate email ' + email + ' on ids '
                                + String.join(dupes.get(email), ', '));
            }
        }

        if (!toUpdate.isEmpty()) {
            List<Database.SaveResult> saves =
                Database.update(toUpdate, false, AccessLevel.USER_MODE);
            for (Database.SaveResult sr : saves) {
                if (sr.isSuccess()) { corrected++; } else { failedSaves++; }
            }
        }
    }

    public void finish(Database.BatchableContext context) {
        String body = String.join(new List<String>{
            'Lead hygiene sweep finished.',
            '',
            'scanned      ' + scanned,
            'corrected    ' + corrected,
            'flagged      ' + flagged + ' (reported, not changed)',
            'failed saves ' + failedSaves,
            '',
            reviewLines.isEmpty()
                ? 'Nothing needs review.'
                : 'Needs review (first ' + reviewLines.size() + '):',
            String.join(reviewLines, '\n')
        }, '\n');
        System.debug(LoggingLevel.INFO, body);
        // Swap for a Messaging.SingleEmailMessage or a platform event. Debug
        // keeps the class deployable with nothing else configured.
    }

    /** Schedulable wrapper, so the class can be scheduled without a second file. */
    public class Scheduler implements Schedulable {
        public void execute(SchedulableContext context) {
            // Scope of 200 is the default and is right for logic with no callouts.
            // Drop it if a validation rule or a trigger makes each record expensive.
            Database.executeBatch(new LeadHygieneBatch(), 200);
        }
    }
}
