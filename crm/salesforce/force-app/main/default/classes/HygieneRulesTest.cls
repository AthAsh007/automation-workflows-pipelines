/**
 * Unit tests for the rules. No SOQL, no DML, no test data setup, because
 * HygieneRules touches no database. That is the payoff for keeping it pure.
 */
@isTest
private class HygieneRulesTest {

    @isTest
    static void collapsesWhitespaceInNameFields() {
        Lead l = new Lead(FirstName='  Priya ', LastName=' Raman  ',
                          Company='Calder   Accounting', Email='a@example.example');
        HygieneRules.Verdict v = HygieneRules.evaluate(l);
        System.assertEquals('Priya', l.FirstName, 'leading and trailing space removed');
        System.assertEquals('Raman', l.LastName);
        System.assertEquals('Calder Accounting', l.Company, 'internal run collapsed to one space');
        System.assert(v.changed, 'whitespace corrections count as a change');
    }

    @isTest
    static void lowercasesTheEmailAndLeavesAMalformedOneInPlace() {
        Lead l = new Lead(LastName='X', Company='Y', Email='  Not-An-Address  ');
        HygieneRules.evaluate(l);
        System.assertEquals('not-an-address', l.Email,
            'a malformed address is still lowercased and trimmed');
        HygieneRules.Verdict v = HygieneRules.evaluate(l);
        System.assert(hasReview(v, 'malformed'),
            'and it is reported rather than blanked, because it is evidence of intent');
    }

    @isTest
    static void flagsFreeMailRoleAndDisposableAddresses() {
        System.assert(hasReview(evaluateEmail('someone@gmail.com'), 'personal address'));
        System.assert(hasReview(evaluateEmail('info@acme.example'), 'role address'));
        System.assert(hasReview(evaluateEmail('x@mailinator.com'), 'disposable'));
        System.assert(!hasReview(evaluateEmail('priya@acme.example'), 'personal address'),
            'an ordinary business address is not flagged');
    }

    @isTest
    static void stripsTheWebsiteToItsHost() {
        Map<String, String> cases = new Map<String, String>{
            'https://www.Acme.example/about?utm_source=x' => 'acme.example',
            'HTTP://ACME.EXAMPLE/'                        => 'acme.example',
            'acme.example'                                => 'acme.example'
        };
        for (String raw : cases.keySet()) {
            Lead l = new Lead(LastName='X', Company='Y', Website=raw);
            HygieneRules.evaluate(l);
            System.assertEquals(cases.get(raw), l.Website, 'for input ' + raw);
        }
    }

    @isTest
    static void leavesFreeTextInTheWebsiteFieldAlone() {
        Lead l = new Lead(LastName='X', Company='Y', Website='ask them at the meeting');
        HygieneRules.evaluate(l);
        System.assertEquals('ask them at the meeting', l.Website,
            'not a host, so nothing is guessed');
    }

    @isTest
    static void expandsAKnownCountryCodeAndFlagsAnUnknownOne() {
        Lead known = new Lead(LastName='X', Company='Y', Country='gb');
        HygieneRules.evaluate(known);
        System.assertEquals('United Kingdom', known.Country);

        Lead unknown = new Lead(LastName='X', Company='Y', Country='ZZ');
        HygieneRules.Verdict v = HygieneRules.evaluate(unknown);
        System.assertEquals('ZZ', unknown.Country, 'an unknown code is not invented');
        System.assert(hasReview(v, 'does not know'));
    }

    @isTest
    static void reportsMissingCompanyRatherThanInferringIt() {
        Lead l = new Lead(LastName='X', Email='priya@calder.example');
        HygieneRules.Verdict v = HygieneRules.evaluate(l);
        System.assert(hasReview(v, 'Company is empty'));
        System.assertEquals(null, l.Company,
            'the email domain is not a company name, however tempting');
    }

    @isTest
    static void findsDuplicatesWithoutResolvingThem() {
        Id a = fakeId(1), b = fakeId(2), c = fakeId(3);
        List<Lead> records = new List<Lead>{
            new Lead(Id=a, LastName='One', Company='C', Email='same@acme.example'),
            new Lead(Id=b, LastName='Two', Company='C', Email='SAME@acme.example'),
            new Lead(Id=c, LastName='Three', Company='C', Email='other@acme.example')
        };
        Map<String, List<Id>> dupes = HygieneRules.findDuplicateEmails(records);
        System.assertEquals(1, dupes.size(), 'case differences are the same address');
        System.assertEquals(2, dupes.get('same@acme.example').size());
    }

    // -- helpers ----------------------------------------------------------

    private static HygieneRules.Verdict evaluateEmail(String email) {
        return HygieneRules.evaluate(new Lead(LastName='X', Company='Y', Email=email));
    }

    private static Boolean hasReview(HygieneRules.Verdict v, String fragment) {
        for (String line : v.needsReview) {
            if (line.containsIgnoreCase(fragment)) { return true; }
        }
        return false;
    }

    private static Id fakeId(Integer n) {
        return Id.valueOf('00Q000000000' + String.valueOf(n).leftPad(3, '0'));
    }
}
