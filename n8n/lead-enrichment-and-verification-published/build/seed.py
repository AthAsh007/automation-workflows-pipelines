# Writes the two seed files for the Organisations tab. Run: python seed.py
#
#   ../sheet/seed-organisations-midstate.csv  real Midstate organisations, contact columns blank.
#                                         The production starting list. Needs an Apollo key
#                                         to produce people.
#   ../sheet/seed-organisations-demo.csv  the messy fixture set: duplicates, stale rows, a
#                                         row with no website, one out of state, one on the
#                                         suppression list. Every fabricated address is at a
#                                         reserved .example domain, so a run with real keys
#                                         cannot mail a real person by accident.
#
# The header comes from ../sheet/Organisations.csv, which build.py generates from the config
# node, so a renamed column can never leave the seed files behind.
import csv, io, os

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, '..', 'sheet')

with io.open(os.path.join(SHEET, 'Organisations.csv'), encoding='utf-8-sig') as f:
    HEADER = next(csv.reader(f))

I = {name: n for n, name in enumerate(HEADER)}


def row(**kw):
    r = [''] * len(HEADER)
    for k, v in kw.items():
        r[I[k]] = v
    return r


def write(name, rows):
    path = os.path.join(SHEET, name)
    with io.open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, lineterminator='\r\n')
        w.writerow(HEADER)
        w.writerows(rows)
    return name, len(rows)


# =====================================================================  the starting list
# The shape a real directory seed takes: organisation, website, county, city, with the
# contact columns left blank for the enrichment step to fill. Every name and domain here is
# invented and every domain is under .example, so importing this file and running with live
# keys cannot reach anyone. Replace the rows with your own list before a real run; the
# Source column exists so a bad batch can be traced back to where it came from.
SEED = 'directory seed - verify website'

MIDSTATE = [
    # ---- hospitals and health systems: discharge planning, inpatient behavioral health
    ('Riverside Methodist Hospital', 'riverside-methodist.example', 'Ashfield', 'Calder City'),
    ('Northgate Health System', 'northgate-health.example', 'Ashfield', 'Calder City'),
    ('State University Medical Center', 'state-university-medical.example', 'Ashfield', 'Calder City'),
    ('Metro Health Medical Center', 'metro-health.example', 'Bayview', 'Port Alder'),
    ('University Hospitals Medical Center', 'university-hospitals.example', 'Bayview', 'Port Alder'),
    ('Lakeside Clinic', 'lakeside-clinic.example', 'Bayview', 'Port Alder'),
    ('Summit Health', 'summit-health.example', 'Summit', 'Ridgeway'),
    ('Promedic Regional Hospital', 'promedic-health.example', 'Larkin', 'Westmoor'),
    ('Tri-Health Good Shepherd Hospital', 'tri-health.example', 'Halloway', 'Southbank'),
    ('University Health Medical Center', 'university-health.example', 'Halloway', 'Southbank'),
    ('Kettleridge Health', 'kettleridge-health.example', 'Marlow', 'Denby'),
    ('Premier Health Valley Hospital', 'premier-health.example', 'Marlow', 'Denby'),
    ('Adena Regional Medical Center', 'adena-regional.example', 'Rossmore', 'Chilton'),
    ('Genesis Community Hospital', 'genesis-health.example', 'Muskin', 'Zane Falls'),
    ('Firelands Regional Medical Center', 'firelands-regional.example', 'Erieton', 'Sandhaven'),
    ('Hollow Valley Community Hospital', 'hollow-valley-hospital.example', 'Hocking', 'Logansford'),
    ('Woodland County Hospital', 'woodland-county-hospital.example', 'Woodland', 'Green Bowling'),

    # ---- county social services and mental-health boards
    ('Lakeshore County Job and Family Services', 'jfs.lakeshore-county.example', 'Ashfield', 'Calder City'),
    ('Harbor County Job and Family Services', 'harbor-county-jfs.example', 'Halloway', 'Southbank'),
    ('Marlow County Job and Family Services', 'midstate-county.example', 'Marlow', 'Denby'),
    ('ADAMH Board of Lakeshore County', 'adamh-lakeshore.example', 'Ashfield', 'Calder City'),
    ('ADM Board of Summit County', 'adm-board.example', 'Summit', 'Ridgeway'),

    # ---- addiction treatment
    ('Harborview Recovery', 'harborview-recovery.example', 'Ashfield', 'Calder City'),
    ('Bridgeway House', 'bridgeway-house.example', 'Halloway', 'Southbank'),
    ('Oriana Halfway House', 'oriana-house.example', 'Summit', 'Ridgeway'),
    ('Integrated Behavioral Recovery Center', 'integrated-behavioral.example', 'Summit', 'Ridgeway'),
    ('Stella Maris Center', 'stella-maris.example', 'Bayview', 'Port Alder'),
    ('Brightview Health', 'brightview-health.example', 'Halloway', 'Southbank'),

    # ---- behavioral health providers
    ('Southside Healthcare', 'southside-services.example', 'Ashfield', 'Calder City'),
    ('North Central Mental Health Services', 'north-central-mhs.example', 'Ashfield', 'Calder City'),
    ('Frontline Service', 'frontline-service.example', 'Bayview', 'Port Alder'),
    ('The Centers', 'the-centers.example', 'Bayview', 'Port Alder'),
    ('Zephyr Center', 'zephyr-center.example', 'Larkin', 'Westmoor'),
    ('Coleman Health Services', 'coleman-services.example', 'Summit', 'Ridgeway'),
    ('Greater Region Behavioral Health Services', 'greater-behavioral-health.example', 'Halloway', 'Southbank'),
    ('Guidestone', 'guidestone.example', 'Bayview', 'Brea Hill'),

    # ---- community non-profits
    ('Impact Community Action', 'community-action.example', 'Ashfield', 'Calder City'),
    ('Community Shelter Board', 'county-services-board.example', 'Ashfield', 'Calder City'),
    ('Social Services Network of Hope', 'network-of-hope.example', 'Ashfield', 'Calder City'),
    ('Mid-Region Food Collective', 'mission-of-care.example', 'Ashfield', 'Grove Heights'),
    ('Volunteers of the Region', 'volunteers-of-midstate.example', 'Ashfield', 'Calder City'),
    ('YMCA of the Capital Region', 'ymca-capital.example', 'Ashfield', 'Calder City'),
]

midstate_rows = [row(**{'Organisation': n, 'Website': w, 'County': c, 'City': city,
                    'State': 'MW', 'Source': SEED, 'Status': 'New'})
             for (n, w, c, city) in MIDSTATE]

# =====================================================================  the demo fixture
# Same shapes as sample/organisations.json, which simulate.js asserts against. Contact
# addresses are at .example domains (RFC 2606, reserved and unroutable) precisely so that
# turning on a real Instantly key cannot send mail to an invented person at a real hospital.
D = 'demo fixture - not a real contact'

demo_rows = [
    row(Organisation='Northgate East Hospital', Website='https://www.northgate-health.example/locations/east',
        County='Ashfield', City='Calder City', State='MW', Phone='614-555-0100',
        Contact='Delia Wexford', **{'Contact title': 'Director of Case Management',
        'Contact email': 'denise.whitfield@northgate-east.example'},
        Source='midstate hospital association directory', Status='New'),

    row(Organisation='MOUNT CARMEL EAST', Website='www.northgate-health.example',
        County='Ashfield', City='Calder City', State='MW',
        Source='google maps scrape', Status='New', Notes='the same place, scraped twice'),

    row(Organisation='Lakeshore County Job and Family Services',
        Website='jfs.lakeshore-county.example', County='Ashfield', City='Calder City', State='MW',
        Phone='614-555-0100', **{'Contact title': 'Intake Coordinator',
        'Contact email': 'info@lakeshore-jfs.example'},
        Source='county directory', Notes='a shared mailbox - must be held, not emailed'),

    row(Organisation='Harborview Recovery Addiction Recovery', Website='https://harborview-recovery.example/',
        County='Ashfield', City='Calder City', State='MW', Phone='614-555-0131',
        Contact='Dara Kellen', **{'Contact title': 'Intake Coordinator',
        'Contact email': 'dana.kirk@harborview-demo.example'},
        Source='SAMHSA treatment locator', Status='New'),

    row(Organisation='IMPACT Community Action', Website='community-action.example', County='Ashfield',
        City='Calder City', State='MW', Phone='614-555-0179',
        Source='united way partner list', Status='New',
        Notes='no contact on the row - reported as not found, never guessed at'),

    row(Organisation='Southeast Healthcare', Website='southside-services.example', County='Ashfield',
        City='Calder City', State='MW', Phone='614-555-0190',
        Contact='Gareth Nolan', **{'Contact title': 'Director of Nursing',
        'Contact email': 'g.nash@southside-demo.example'},
        Source='google maps scrape', Status='New',
        Notes='the name gives nothing away - this is the one the AI classifier earns its keep on'),

    row(Organisation='Bridgeway House', County='Halloway', City='Southbank', State='MW',
        Phone='513-555-0100', Contact='Leah Cortez',
        **{'Contact title': 'Director of Admissions',
           'Contact email': 'lisa.cordero@bridgeway-demo.example'},
        Source='manual research', Status='New', Notes='no website on the row'),

    row(Organisation='Summit County ADAMHS Board', Website='adm-board.example', County='Summit',
        City='Ridgeway', State='MW', Phone='330-555-0100', Contact='Arlen Whitcastle',
        **{'Contact title': 'Clinical Director', 'Contact email': 'awhitcomb@adm-board-demo.example'},
        Source='county directory', Status='New'),

    row(**{'Org id': 'ORG-lakeviewbhorg', 'Organisation': 'Lakeview Behavioral Health',
           'Category': 'Behavioral health provider', 'Website': 'lakeview-behavioral-demo.example',
           'County': 'Bayview', 'City': 'Port Alder', 'State': 'MW', 'Phone': '216-555-0102',
           'Source': 'manual research', 'Status': 'Enriched', 'Enriched at': '2026-08-28 07:04',
           'Contacts found': '2', 'Notes': 'done four days ago - must not be re-enriched'}),

    row(**{'Org id': 'ORG-stalefallsorg', 'Organisation': 'Stale Falls Counseling',
           'Category': 'Behavioral health provider', 'Website': 'stalefalls.example',
           'County': 'Larkin', 'City': 'Westmoor', 'State': 'MW', 'Source': 'manual research',
           'Status': 'Ready', 'Enriched at': '2026-01-12 07:02', 'Contacts found': '1',
           'Notes': 'enriched in January - past REENRICH_AFTER_DAYS, so it comes round again'}),

    row(Organisation='Riverbend Recovery Center', Website='riverbend-recovery.example',
        County='Wayne', City='Detroit', State='MI', Phone='313-555-0144',
        Contact='Noel Boyden', **{'Contact title': 'Program Director',
        'Contact email': 'nboyd@riverbend-recovery.example'},
        Source='google maps scrape', Status='New',
        Notes='over the state line - Evergreen is licensed in Midstate only'),

    row(Organisation='Do Not Contact Test Org', Website='mentorship-alliance.example',
        County='Ashfield', City='Calder City', State='MW', Contact='Zane Norwood',
        **{'Contact title': 'Executive Director', 'Contact email': 'zak@mentorship-alliance.example'},
        Source='manual research', Status='New',
        Notes="the client's own domain - on the suppression list"),

    row(Website='https://nameless.example', State='MW', Source='bad scrape', Status='New',
        Notes='an empty row a scraper left behind'),

    row(Organisation='Hocking Valley Community Hospital', Website='hollow-valley-hospital.example', County='Hocking',
        City='Logan', State='MW', Phone='740-555-0100', Source='midstate hospital association directory',
        Status='Do not contact', Notes='asked to be left alone - status is not in READY_STATUSES'),
]

print('wrote sheet/%s (%d rows)' % write('seed-organisations-midstate.csv', midstate_rows))
print('wrote sheet/%s (%d rows)' % write('seed-organisations-demo.csv', demo_rows))
print('(%s)' % D)
