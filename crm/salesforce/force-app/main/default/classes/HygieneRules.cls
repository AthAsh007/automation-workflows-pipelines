/**
 * The lead hygiene rules. No SOQL, no DML, no callouts.
 *
 * Keeping this class free of database access is the point. It makes every rule
 * unit-testable against in-memory sObjects with no test data setup, and it makes
 * a query inside a loop impossible to write here by accident, which is the bug
 * behind most Salesforce governor-limit failures.
 *
 * The split that governs every rule: a fix is applied automatically only when it
 * preserves information. Trimming whitespace, lowercasing an email domain and
 * stripping a URL to its host all do. Merging two leads, choosing between two
 * phone numbers and deleting a duplicate do not, so those are reported for a
 * human and never done here.
 */
public with sharing class HygieneRules {

    /** One correction, with enough detail to audit it afterwards. */
    public class Change {
        @AuraEnabled public String fieldName;
        @AuraEnabled public String oldValue;
        @AuraEnabled public String newValue;
        @AuraEnabled public String rule;

        public Change(String fieldName, String oldValue, String newValue, String rule) {
            this.fieldName = fieldName;
            this.oldValue  = oldValue;
            this.newValue  = newValue;
            this.rule      = rule;
        }
    }

    /** What one record needs, split by whether a machine may do it. */
    public class Verdict {
        @AuraEnabled public Lead record;
        @AuraEnabled public List<Change> autoFixed = new List<Change>();
        @AuraEnabled public List<String> needsReview = new List<String>();
        @AuraEnabled public Boolean changed = false;
    }

    private static final Set<String> FREE_MAIL = new Set<String>{
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
        'icloud.com', 'live.com', 'msn.com', 'protonmail.com', 'proton.me'
    };

    private static final Set<String> DISPOSABLE = new Set<String>{
        'mailinator.com', 'guerrillamail.com', '10minutemail.com',
        'sharklasers.com', 'yopmail.com', 'trashmail.com', 'tempmail.com'
    };

    private static final Set<String> ROLE_LOCAL_PARTS = new Set<String>{
        'info', 'sales', 'admin', 'support', 'contact', 'hello', 'enquiries',
        'office', 'help', 'team', 'no-reply', 'noreply'
    };

    /**
     * Apply every rule to one record. Returns a Verdict; mutates the Lead in
     * place only for the corrections that preserve information.
     *
     * The caller decides whether to persist. This method never writes.
     */
    public static Verdict evaluate(Lead record) {
        Verdict v = new Verdict();
        v.record = record;

        // --- whitespace: always safe -------------------------------------
        for (String field : new List<String>{'FirstName', 'LastName', 'Company', 'Title'}) {
            Object raw = record.get(field);
            if (raw == null) { continue; }
            String before = String.valueOf(raw);
            String after  = before.trim().replaceAll('\\s+', ' ');
            if (after != before) {
                record.put(field, after);
                v.autoFixed.add(new Change(field, before, after, 'collapse whitespace'));
            }
        }

        // --- email: lowercase, then classify -----------------------------
        if (String.isNotBlank(record.Email)) {
            String before = record.Email;
            String after  = before.trim().toLowerCase();
            if (after != before) {
                record.Email = after;
                v.autoFixed.add(new Change('Email', before, after, 'lowercase address'));
            }
            if (!after.contains('@') || after.startsWith('@') || after.endsWith('@')) {
                // Never blank it. A malformed address is still evidence of intent,
                // and deleting it destroys the only trace of where the lead came from.
                v.needsReview.add('Email is malformed: ' + after);
            } else {
                String localPart = after.substringBefore('@');
                String domain    = after.substringAfter('@');
                if (DISPOSABLE.contains(domain)) {
                    v.needsReview.add('Email is at a disposable provider: ' + domain);
                } else if (FREE_MAIL.contains(domain)) {
                    v.needsReview.add('Email is a personal address, not a business one');
                }
                if (ROLE_LOCAL_PARTS.contains(localPart)) {
                    v.needsReview.add('Email is a role address, not a person: ' + localPart);
                }
            }
        }

        // --- website: strip to the host ----------------------------------
        if (String.isNotBlank(record.Website)) {
            String before = record.Website;
            String after  = normaliseHost(before);
            if (after != null && after != before) {
                record.Website = after;
                v.autoFixed.add(new Change('Website', before, after, 'strip to host'));
            }
        }

        // --- country: expand a known code --------------------------------
        if (String.isNotBlank(record.Country) && record.Country.trim().length() == 2) {
            String code = record.Country.trim().toUpperCase();
            Map<String, String> known = new Map<String, String>{
                'GB' => 'United Kingdom', 'US' => 'United States', 'SG' => 'Singapore',
                'AU' => 'Australia', 'CA' => 'Canada', 'IE' => 'Ireland',
                'NZ' => 'New Zealand', 'IN' => 'India'
            };
            if (known.containsKey(code)) {
                String before = record.Country;
                record.Country = known.get(code);
                v.autoFixed.add(new Change('Country', before, record.Country, 'expand country code'));
            } else {
                v.needsReview.add('Country is a two-letter code this rule set does not know: ' + code);
            }
        }

        // --- things a machine must not decide -----------------------------
        if (String.isBlank(record.Company)) {
            v.needsReview.add('Company is empty. Do not infer it from the email domain');
        }
        if (String.isBlank(record.Email) && String.isBlank(record.Phone)) {
            v.needsReview.add('No email and no phone. The lead cannot be contacted');
        }

        v.changed = !v.autoFixed.isEmpty();
        return v;
    }

    /**
     * 'https://www.Acme.example/about?utm_source=x' -> 'acme.example'
     * Returns null when there is nothing usable, so the caller leaves the field alone.
     */
    @TestVisible
    private static String normaliseHost(String raw) {
        if (String.isBlank(raw)) { return null; }
        String s = raw.trim().toLowerCase();
        s = s.replaceFirst('^https?://', '');
        s = s.replaceFirst('^www\\.', '');
        s = s.substringBefore('/').substringBefore('?').substringBefore('#');
        // A host has at least one dot and no spaces. Anything else is free text.
        return (s.contains('.') && !s.contains(' ')) ? s : null;
    }

    /**
     * Duplicate detection, reported and never resolved.
     *
     * Returns a map of email to the record ids sharing it. Merging is a decision
     * with consequences (which record survives, which activities move with it),
     * so this only ever produces a list for a human.
     */
    public static Map<String, List<Id>> findDuplicateEmails(List<Lead> records) {
        Map<String, List<Id>> byEmail = new Map<String, List<Id>>();
        for (Lead record : records) {
            if (String.isBlank(record.Email) || record.Id == null) { continue; }
            String key = record.Email.trim().toLowerCase();
            if (!byEmail.containsKey(key)) { byEmail.put(key, new List<Id>()); }
            byEmail.get(key).add(record.Id);
        }
        Map<String, List<Id>> dupes = new Map<String, List<Id>>();
        for (String key : byEmail.keySet()) {
            if (byEmail.get(key).size() > 1) { dupes.put(key, byEmail.get(key)); }
        }
        return dupes;
    }
}
