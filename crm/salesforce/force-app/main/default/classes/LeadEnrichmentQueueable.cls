/**
 * Enrich leads from an external service, after the transaction has committed.
 *
 * Why a Queueable and not @future or a trigger:
 *
 *   * You cannot call out from a trigger context. Queueing is the way around it.
 *   * The callout happens after commit, so a rollback cannot leave you having
 *     told an external system about a record that no longer exists.
 *   * Unlike @future, a Queueable can be chained and can carry typed state, and
 *     you get a job id you can query.
 *
 * The two things that go wrong with chained Queueables, both handled here:
 * an unbounded chain that runs until it hits the platform's stack depth, and a
 * batch that exhausts its callout allowance halfway and throws, losing the
 * record of what it already did.
 */
public with sharing class LeadEnrichmentQueueable
        implements Queueable, Database.AllowsCallouts {

    /** Leave headroom rather than discovering the limit at run time. */
    private static final Integer MAX_CHAIN_DEPTH = 4;
    private static final Integer BATCH_SIZE      = 20;
    private static final Integer CALLOUT_TIMEOUT_MS = 20000;

    private final List<Id> leadIds;
    private final Integer depth;

    public LeadEnrichmentQueueable(List<Id> leadIds, Integer depth) {
        this.leadIds = leadIds == null ? new List<Id>() : leadIds;
        this.depth   = depth == null ? 0 : depth;
    }

    public void execute(QueueableContext context) {
        if (leadIds.isEmpty()) { return; }

        List<Id> thisRun = new List<Id>();
        List<Id> deferred = new List<Id>();
        for (Integer i = 0; i < leadIds.size(); i++) {
            if (i < BATCH_SIZE) { thisRun.add(leadIds[i]); } else { deferred.add(leadIds[i]); }
        }

        List<Lead> records = [
            SELECT Id, Email, Website, Company, Country
            FROM Lead
            WHERE Id IN :thisRun
            WITH USER_MODE
        ];

        List<Lead> enriched = new List<Lead>();
        List<String> skipped = new List<String>();

        for (Lead record : records) {
            // Check before each call, not after. Throwing on the eleventh record
            // loses the fact that ten were already enriched.
            if (Limits.getCallouts() >= Limits.getLimitCallouts() - 1) {
                skipped.add(record.Id + ': callout limit reached');
                deferred.add(record.Id);
                continue;
            }
            if (String.isBlank(record.Website) && String.isBlank(record.Email)) {
                skipped.add(record.Id + ': nothing to look up');
                continue;
            }
            try {
                Map<String, Object> data = lookup(record);
                if (data != null) {
                    if (data.containsKey('company') && String.isBlank(record.Company)) {
                        record.Company = String.valueOf(data.get('company'));
                    }
                    if (data.containsKey('country') && String.isBlank(record.Country)) {
                        record.Country = String.valueOf(data.get('country'));
                    }
                    enriched.add(record);
                }
            } catch (CalloutException e) {
                // A transport failure is retryable, so the record goes back in
                // the queue rather than being silently dropped.
                skipped.add(record.Id + ': ' + e.getMessage());
                deferred.add(record.Id);
            }
        }

        if (!enriched.isEmpty()) {
            Database.update(enriched, false, AccessLevel.USER_MODE);
        }
        if (!skipped.isEmpty()) {
            System.debug(LoggingLevel.WARN, 'enrichment skipped ' + skipped.size()
                         + ' record(s): ' + String.join(skipped, ' | '));
        }

        // The chain, bounded. Without the depth guard this runs until the
        // platform stops it, and the platform stopping it is not a good log line.
        if (!deferred.isEmpty() && depth < MAX_CHAIN_DEPTH && !Test.isRunningTest()) {
            System.enqueueJob(new LeadEnrichmentQueueable(deferred, depth + 1));
        } else if (!deferred.isEmpty()) {
            System.debug(LoggingLevel.WARN,
                'enrichment stopped at depth ' + depth + ' with '
                + deferred.size() + ' record(s) not enriched. '
                + 'They will be picked up by LeadHygieneBatch on its next run.');
        }
    }

    /**
     * The callout. Named Credential rather than a hard-coded endpoint, so the
     * URL and the secret live in setup and never in the repository.
     */
    private Map<String, Object> lookup(Lead record) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Lead_Enrichment/v1/lookup');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(CALLOUT_TIMEOUT_MS);
        req.setBody(JSON.serialize(new Map<String, Object>{
            'domain' => record.Website,
            'email'  => record.Email
        }));

        HttpResponse res = new Http().send(req);
        Integer status = res.getStatusCode();

        if (status == 404) { return null; }                       // not found is not an error
        if (status == 429 || status >= 500) {
            throw new CalloutException('retryable status ' + status);
        }
        if (status != 200) {
            throw new CalloutException('status ' + status + ': ' + res.getBody().left(200));
        }
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }
}
