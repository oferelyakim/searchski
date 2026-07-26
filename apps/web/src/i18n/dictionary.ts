/**
 * Minimal locale layer: `en` and `he`, one flat dictionary per locale.
 *
 * Deliberately not a framework. The app has one dictionary's worth of chrome and
 * does not need routing, message extraction or ICU plurals.
 *
 * Hebrew is here as proof the layer handles a right-to-left script end to end,
 * not because the audience is Israeli — it is not. Adding `fr`, `nl` or `de` is
 * a matter of copying the `en` block; the `dir="rtl"` handling already works, so
 * the hard case is the one that is done.
 *
 * Resort names, region names and localities are NEVER translated. They come
 * from OpenStreetMap in their own script and stay that way.
 */

export const LOCALES = ['en', 'he'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'searchski_locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'en' || value === 'he';
}

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'he' ? 'rtl' : 'ltr';
}

const en = {
  'app.name': 'Searchski',
  'app.tagline': 'Describe the trip you want. See exactly why each resort matched.',
  'nav.search': 'Search',
  'nav.compare': 'Compare',
  'nav.about': 'About the data',
  'nav.skipToContent': 'Skip to content',
  'nav.theme': 'Switch theme',
  'nav.language': 'Language',

  'search.heading': 'Describe the trip you want',
  'search.placeholder':
    'quiet slopes, good for a nervous intermediate, night skiing, under 60 a day',
  'search.submit': 'Find resorts',
  'search.searching': 'Searching…',
  'search.inputLabel': 'Describe your ideal ski trip in your own words',
  'search.parsedHeading': 'How we read your query',
  'search.parsedEmpty': 'Nothing parsed yet — type what you want, or use the filters.',
  'search.parsedHelp':
    'These are the criteria we actually searched on. Remove any that are wrong; the results update.',
  'search.filters': 'Filters',
  'search.filtersHint': 'Filters and the sentence above always stay in sync.',
  'search.results': 'Results',
  'search.resultsCount': 'resorts scored',
  'search.noResults': 'No resorts matched. Try removing a filter.',
  'search.relaxed':
    'Nothing matched every filter, so these were relaxed to show the closest matches:',
  'search.reset': 'Clear all',
  'search.error': 'Search failed. Your filters were kept — try again.',
  'search.trip': 'Your trip',
  'search.tripHint':
    'All optional. Dates and party size are carried into the booking links and never change the ranking — we hold no opening dates, so pretending they affect the score would be an invention.',
  'search.originHint':
    'Any three-letter IATA code, e.g. LTN, CDG, TLV. There is no default — we do not assume where you fly from, and without it we show no flight links rather than a broken one.',
  'search.originPlaceholder': 'IATA',

  'criteria.dateFrom': 'Arrive',
  'criteria.dateTo': 'Leave',
  'criteria.adults': 'Adults',
  'criteria.children': 'Children',
  'criteria.ability': 'Ability',
  'criteria.groupAbilities': 'Group abilities',
  'criteria.countries': 'Countries',
  'criteria.minKm': 'At least km of piste',
  'criteria.maxKm': 'At most km of piste',
  'criteria.minVerticalM': 'Minimum vertical',
  'criteria.minTopElevM': 'Minimum top elevation',
  'criteria.wantNightSki': 'Night skiing',
  'criteria.wantApres': 'Après-ski',
  'criteria.wantFamily': 'Family friendly',
  'criteria.wantUncrowded': 'Uncrowded',
  'criteria.wantSnowsure': 'Snow-reliable',
  'criteria.wantSkiInSkiOut': 'Ski-in / ski-out',
  'criteria.wantKosher': 'Kosher food',
  'criteria.wantHebrewSkiSchool': 'Hebrew-speaking ski school',
  'criteria.maxChabadDistanceKm': 'Chabad within',
  'criteria.originAirport': 'From airport',
  'criteria.maxTransferMinutes': 'Max transfer',
  'criteria.maxPassPricePerDay': 'Max pass price per day',
  'criteria.remove': 'Remove this criterion',
  'criteria.any': 'Any',

  'ability.first_timer': 'First-timer',
  'ability.beginner': 'Beginner',
  'ability.intermediate': 'Intermediate',
  'ability.advanced': 'Advanced',
  'ability.expert': 'Expert',

  'difficulty.novice': 'Novice',
  'difficulty.easy': 'Easy',
  'difficulty.intermediate': 'Intermediate',
  'difficulty.advanced': 'Advanced',
  'difficulty.expert': 'Expert',
  'difficulty.freeride': 'Freeride',
  'difficulty.other': 'Unclassified',

  'result.score': 'Match',
  'result.why': 'Why this score',
  'result.whyHide': 'Hide breakdown',
  'result.noData': 'not enough data',
  'result.noDataExplain':
    'We had no data for this, so it scored neutral and did not move the ranking.',
  'result.compare': 'Compare',
  'result.added': 'Added',
  'result.view': 'View resort',
  'result.relaxed': 'Does not meet:',
  'result.nameMatchPrimary': 'Pinned to the top — you searched for',
  'result.nameMatchAlias': 'Pinned to the top — matched',
  'result.nameMatchWhy':
    'one of this area’s other names, so it ranks above higher-scoring resorts',
  'result.explaining': 'Writing an explanation…',
  'result.explainedBy': 'Written by Claude from the scoring factors below. The numbers are the ranking; this paragraph only phrases them.',
  'search.parsedByLlm': 'Claude read your sentence and filled these in. Check them — if it misread you, remove or edit a chip and the results update.',
  'search.parsedByDeterministic': 'Read by keyword matching. Add anything it missed with the filters.',
  'resort.boundaryNote': 'Piste total caveat',

  'resort.overview': 'Overview',
  'resort.terrain': 'Terrain mix',
  'resort.elevation': 'Elevation',
  'resort.lifts': 'Lifts',
  'resort.crowding': 'Crowding',
  'resort.nightSki': 'Night skiing',
  'resort.travel': 'Getting there',
  'resort.israel': 'For Israeli visitors',
  'resort.passRegion': 'Lift pass area',
  'resort.links': 'Official links',
  'resort.map': 'Map',
  'resort.conditions': 'Forecast',
  'resort.notFound': 'That resort is not in our data.',
  'resort.pistes': 'Marked piste',
  'resort.runs': 'runs',
  'resort.liftsTotal': 'lifts',
  'resort.vertical': 'Vertical',
  'resort.top': 'Top',
  'resort.base': 'Base',
  'resort.snowmaking': 'Snowmaking',
  'resort.capacity': 'Modelled uphill capacity',
  'resort.capacityHelp':
    'Estimated from lift types using industry-standard throughput. A relative signal between resorts, never a measured number.',
  'resort.unknown': 'unknown',
  'resort.yes': 'yes',
  'resort.no': 'no',
  'resort.officialSite': 'Official site',
  'resort.trailMap': 'Official trail map',
  'resort.trailMapNote':
    "We link to the resort's own trail map rather than copying it. Trail maps are their artwork.",
  'resort.passPrices': 'Lift pass',
  'resort.noPassPrices': 'No lift pass price on file yet.',
  'resort.noTransfers': 'No airport transfer times on file yet.',
  'resort.driveTime': 'by road',
  'resort.directTlv': 'direct from TLV',
  'resort.gateway': 'Nearest airport we hold',
  'resort.gatewayDerived':
    'Straight-line distance. We hold no measured drive time for this route, so none is shown — a mountain road is not a straight line and guessing would be worse than saying nothing.',

  'book.title': 'Book this trip',
  'book.intro':
    'Four separate searches on four independent companies. Searchski sells none of this, takes no payment and is never the merchant of record — you book with each company yourself, and your contract is with them. These links open a search, not a quote: nothing here is a price, a booking or an availability check.',
  'book.flights': 'Flights',
  'book.flightsNote': 'Return search from your origin airport to the arrival airport below.',
  'book.lodging': 'Where to stay',
  'book.lodgingNote':
    'Hotels, apartments and chalets in the village. Booked separately from the flight, on purpose.',
  'book.transfer': 'Airport transfer',
  'book.transferNote':
    'A prebooked vehicle from the arrival airport. On these routes it is usually the most useful link on the page: the drive is long and mountainous, and a family with skis, boots and boot bags does not fit in a saloon taxi.',
  'book.car': 'Car hire — often the wrong answer',
  'book.carNote':
    'Winter tyres and snow chains are a legal requirement, not advice, on much of the Alpine road network in season, and rental fleets do not always include them. Many resort villages restrict or charge heavily for parking, and some — Zermatt, Avoriaz, Wengen — do not let you drive in at all. A hire car earns its keep for multi-resort trips and thin transfer markets; otherwise the transfer above is the better answer.',
  'book.window': 'Trip window',
  'book.noDates':
    'No dates set. The links below open an undated search. Add dates on the search page and they will be carried through to every one of them.',
  'book.noOrigin':
    'No origin airport set, so no flight links are shown. Set “Flying from” on the search page — we do not guess a departure airport.',
  'book.noFlightDates':
    'Flight search needs a departure date. Add your dates on the search page and the flight links appear here.',
  'book.noAirport':
    'We hold no gateway airport near this resort, so transfer and car-hire searches cannot be built for it. That is a gap in our data, not a statement that none exist.',
  'book.arriveAt': 'Arriving at',
  'book.setTrip': 'Set dates and origin',
  'book.unverifiedUrls':
    'These deep-link formats are our best reading of each provider’s public search URL and are not verified against their live sites. If a link lands on a plain search form with your details missing, that is why — fill it in there.',
  'book.affiliate':
    'Links marked “affiliate link” pay Searchski a commission if you book. They are labelled at the point of the click and the ranking cannot see them.',

  'israel.kosher': 'Kosher food',
  'israel.chabad': 'Nearest Chabad',
  'israel.hebrewSchool': 'Hebrew-speaking ski school',
  'israel.shabbat': 'Shabbat',
  'israel.apres': 'Après-ski',
  'israel.family': 'Family',
  'israel.gateways': 'Israeli gateway airports',
  'israel.none': 'Nothing has been researched for this resort yet.',
  'israel.kosher.0': 'None known',
  'israel.kosher.1': 'Limited',
  'israel.kosher.2': 'Good',
  'israel.kosher.3': 'Extensive',

  'verify.verified': 'Verified',
  'verify.unverified': 'Not yet verified',
  'verify.stale': 'May be out of date',
  'verify.explainUnverified':
    'A person has not checked this against a primary source. Treat it as a lead, not a fact — confirm it yourself before you rely on it.',
  'verify.explainStale':
    'This was verified once but the check is old. Confirm it before you rely on it.',
  'verify.kosherWarning':
    'Do not rely on this for kashrut. Confirm directly with the establishment or a local rabbinate.',

  'compare.title': 'Compare resorts',
  'compare.empty': 'Add up to four resorts from the search results to compare them.',
  'compare.remove': 'Remove from comparison',
  'compare.limit': 'Up to four resorts can be compared at once.',
  'compare.back': 'Back to search',

  'banner.sample':
    'Showing the built-in sample dataset. The ETL has not been run, so these figures are placeholders — nothing here is researched data.',
  'banner.source': 'Data source',

  'outbound.label': 'Opens on a third-party site',
  'outbound.aria': 'external link, opens in a new tab',

  'about.title': 'About the data',
  'footer.attribution': 'Ski area data © OpenSkiMap and OpenStreetMap contributors, ODbL.',
  'footer.notOperator': 'Searchski is a referral service, not a tour operator.',
  'error.generic': 'Something went wrong. Nothing was lost — try again.',
  'notFound.title': 'Page not found',
  'notFound.body': 'That page does not exist.',
} as const;

export type MessageKey = keyof typeof en;

const he: Record<MessageKey, string> = {
  'app.name': 'Searchski',
  'app.tagline': 'מנוע החלטות לחופשת סקי, לסקייאים ישראלים',
  'nav.search': 'חיפוש',
  'nav.compare': 'השוואה',
  'nav.about': 'על הנתונים',
  'nav.skipToContent': 'דלג לתוכן',
  'nav.theme': 'החלפת ערכת נושא',
  'nav.language': 'שפה',

  'search.heading': 'תארו את החופשה שאתם רוצים',
  'search.placeholder': 'לא צפוף, מתאים לרמה בינונית חששנית, אוכל כשר בסביבה, עד 300 ליום',
  'search.submit': 'מצא אתרי סקי',
  'search.searching': 'מחפש…',
  'search.inputLabel': 'תארו במילים שלכם את חופשת הסקי האידיאלית',
  'search.parsedHeading': 'כך הבנו את הבקשה',
  'search.parsedEmpty': 'עדיין לא פורש דבר — כתבו מה אתם רוצים, או השתמשו במסננים.',
  'search.parsedHelp': 'אלה הקריטריונים שלפיהם חיפשנו בפועל. הסירו כל מה שלא נכון — התוצאות יתעדכנו.',
  'search.filters': 'מסננים',
  'search.filtersHint': 'המסננים והמשפט למעלה תמיד מסונכרנים.',
  'search.results': 'תוצאות',
  'search.resultsCount': 'אתרים דורגו',
  'search.noResults': 'לא נמצאו אתרים מתאימים. נסו להסיר מסנן.',
  'search.relaxed': 'שום אתר לא עמד בכל המסננים, ולכן אלה רוככו כדי להציג את הקרובים ביותר:',
  'search.reset': 'נקה הכל',
  'search.error': 'החיפוש נכשל. המסננים נשמרו — נסו שוב.',
  'search.trip': 'הנסיעה שלכם',
  'search.tripHint':
    'הכל אופציונלי. התאריכים וגודל הקבוצה נשלחים לקישורי ההזמנה ואינם משפיעים על הדירוג — אין בידינו תאריכי פתיחה, ולהעמיד פנים שהם משפיעים על הציון יהיה המצאה.',
  'search.originHint':
    'כל קוד IATA בן שלוש אותיות, למשל TLV ,CDG ,LTN. אין ברירת מחדל — איננו מניחים מהיכן אתם טסים, ובלי זה לא נציג קישורי טיסות במקום להציג קישור שבור.',
  'search.originPlaceholder': 'IATA',

  'criteria.dateFrom': 'הגעה',
  'criteria.dateTo': 'עזיבה',
  'criteria.adults': 'מבוגרים',
  'criteria.children': 'ילדים',
  'criteria.ability': 'רמה',
  'criteria.groupAbilities': 'רמות בקבוצה',
  'criteria.countries': 'מדינות',
  'criteria.minKm': 'לפחות ק״מ מסלולים',
  'criteria.maxKm': 'לכל היותר ק״מ מסלולים',
  'criteria.minVerticalM': 'הפרש גבהים מינימלי',
  'criteria.minTopElevM': 'גובה פסגה מינימלי',
  'criteria.wantNightSki': 'סקי לילה',
  'criteria.wantApres': 'אפרה־סקי',
  'criteria.wantFamily': 'מתאים למשפחות',
  'criteria.wantUncrowded': 'לא צפוף',
  'criteria.wantSnowsure': 'שלג אמין',
  'criteria.wantSkiInSkiOut': 'סקי־אין / סקי־אאוט',
  'criteria.wantKosher': 'אוכל כשר',
  'criteria.wantHebrewSkiSchool': 'בית ספר לסקי בעברית',
  'criteria.maxChabadDistanceKm': 'חב״ד בטווח',
  'criteria.originAirport': 'משדה התעופה',
  'criteria.maxTransferMinutes': 'זמן הסעה מרבי',
  'criteria.maxPassPricePerDay': 'מחיר מנוי מרבי ליום',
  'criteria.remove': 'הסר קריטריון',
  'criteria.any': 'הכל',

  'ability.first_timer': 'פעם ראשונה',
  'ability.beginner': 'מתחיל',
  'ability.intermediate': 'בינוני',
  'ability.advanced': 'מתקדם',
  'ability.expert': 'מומחה',

  'difficulty.novice': 'מתחילים',
  'difficulty.easy': 'קל',
  'difficulty.intermediate': 'בינוני',
  'difficulty.advanced': 'מתקדם',
  'difficulty.expert': 'מומחה',
  'difficulty.freeride': 'פרירייד',
  'difficulty.other': 'לא מסווג',

  'result.score': 'התאמה',
  'result.why': 'למה הציון הזה',
  'result.whyHide': 'הסתר פירוט',
  'result.noData': 'אין מספיק נתונים',
  'result.noDataExplain': 'לא היו לנו נתונים על כך, ולכן הציון היה ניטרלי ולא השפיע על הדירוג.',
  'result.compare': 'השווה',
  'result.added': 'נוסף',
  'result.view': 'לעמוד האתר',
  'result.relaxed': 'לא עומד ב:',
  'result.nameMatchPrimary': 'הוצמד לראש הרשימה — חיפשתם',
  'result.nameMatchAlias': 'הוצמד לראש הרשימה — התאמה ל',
  'result.nameMatchWhy': 'אחד השמות הנוספים של האתר, ולכן הוא מדורג מעל אתרים עם ציון גבוה יותר',
  'result.explaining': 'כותב הסבר…',
  'result.explainedBy': 'נכתב על ידי קלוד מתוך גורמי הניקוד שלמטה. המספרים הם הדירוג; הפסקה רק מנסחת אותם.',
  'search.parsedByLlm': 'קלוד קרא את המשפט שלכם ומילא את אלה. בדקו אותם — אם הוא הבין לא נכון, הסירו או ערכו תווית והתוצאות יתעדכנו.',
  'search.parsedByDeterministic': 'נקרא בהתאמת מילות מפתח. הוסיפו במסננים כל מה שפוספס.',
  'resort.boundaryNote': 'הסתייגות לגבי סך הק״מ',

  'resort.overview': 'סקירה',
  'resort.terrain': 'תמהיל מסלולים',
  'resort.elevation': 'גבהים',
  'resort.lifts': 'מעליות',
  'resort.crowding': 'צפיפות',
  'resort.nightSki': 'סקי לילה',
  'resort.travel': 'איך מגיעים',
  'resort.israel': 'למבקרים מישראל',
  'resort.passRegion': 'אזור מנוי',
  'resort.links': 'קישורים רשמיים',
  'resort.map': 'מפה',
  'resort.conditions': 'תחזית',
  'resort.notFound': 'האתר הזה לא נמצא בנתונים שלנו.',
  'resort.pistes': 'מסלולים מסומנים',
  'resort.runs': 'מסלולים',
  'resort.liftsTotal': 'מעליות',
  'resort.vertical': 'הפרש גבהים',
  'resort.top': 'פסגה',
  'resort.base': 'בסיס',
  'resort.snowmaking': 'הנשלגה',
  'resort.capacity': 'קיבולת מעליות מוערכת',
  'resort.capacityHelp':
    'הערכה לפי סוגי המעליות ותפוקה תעשייתית מקובלת. אות יחסי בין אתרים בלבד, לא מדידה.',
  'resort.unknown': 'לא ידוע',
  'resort.yes': 'כן',
  'resort.no': 'לא',
  'resort.officialSite': 'האתר הרשמי',
  'resort.trailMap': 'מפת מסלולים רשמית',
  'resort.trailMapNote': 'אנחנו מקשרים למפת המסלולים של האתר ולא מעתיקים אותה. זו היצירה שלהם.',
  'resort.passPrices': 'מנוי מעליות',
  'resort.noPassPrices': 'אין עדיין מחיר מנוי בנתונים.',
  'resort.noTransfers': 'אין עדיין זמני הסעה משדות תעופה בנתונים.',
  'resort.driveTime': 'בנסיעה',
  'resort.directTlv': 'טיסה ישירה מתל אביב',
  'resort.gateway': 'שדה התעופה הקרוב ביותר שיש בנתונים',
  'resort.gatewayDerived':
    'מרחק אווירי. אין בידינו זמן נסיעה מדוד למסלול הזה ולכן לא מוצג כזה — כביש הרים אינו קו ישר, וניחוש יהיה גרוע יותר משתיקה.',

  'book.title': 'להזמין את הנסיעה',
  'book.intro':
    'ארבעה חיפושים נפרדים בארבע חברות עצמאיות. Searchski לא מוכר דבר מכל אלה, לא גובה תשלום ואינו הסוחר הרשום — אתם מזמינים ישירות מכל חברה, והחוזה הוא מולה. הקישורים פותחים חיפוש ולא הצעת מחיר: אין כאן מחיר, הזמנה או בדיקת זמינות.',
  'book.flights': 'טיסות',
  'book.flightsNote': 'חיפוש הלוך־ושוב משדה התעופה שלכם אל שדה התעופה שלמטה.',
  'book.lodging': 'איפה לישון',
  'book.lodgingNote': 'מלונות, דירות ושאלה בכפר. מוזמנים בנפרד מהטיסה, במכוון.',
  'book.transfer': 'הסעה משדה התעופה',
  'book.transferNote':
    'רכב מוזמן מראש משדה התעופה. במסלולים האלה זה בדרך כלל הקישור השימושי בעמוד: הנסיעה ארוכה והררית, ומשפחה עם מגלשיים, מגפיים ותיקים לא נכנסת למונית רגילה.',
  'book.car': 'השכרת רכב — לרוב התשובה הלא נכונה',
  'book.carNote':
    'צמיגי חורף ושרשראות שלג הם דרישה חוקית ולא המלצה בחלק גדול מכבישי האלפים בעונה, וצי הרכבים של חברות ההשכרה לא תמיד כולל אותם. כפרי נופש רבים מגבילים חניה או גובים עליה ביוקר, ובחלקם — צרמט, אבוריאז, וונגן — אי אפשר להיכנס ברכב כלל. רכב שכור משתלם לטיולים בין כמה אתרים ולאזורים עם כיסוי הסעות דל; אחרת ההסעה שלמעלה עדיפה.',
  'book.window': 'חלון הנסיעה',
  'book.noDates':
    'לא הוגדרו תאריכים. הקישורים למטה פותחים חיפוש ללא תאריכים. הוסיפו תאריכים בעמוד החיפוש והם ייסחבו לכל אחד מהם.',
  'book.noOrigin':
    'לא הוגדר שדה תעופה מוצא, ולכן לא מוצגים קישורי טיסות. הגדירו „טסים מ” בעמוד החיפוש — איננו מנחשים שדה תעופה.',
  'book.noFlightDates':
    'חיפוש טיסה מחייב תאריך יציאה. הוסיפו תאריכים בעמוד החיפוש וקישורי הטיסות יופיעו כאן.',
  'book.noAirport':
    'אין בידינו שדה תעופה קרוב לאתר הזה, ולכן אי אפשר לבנות חיפוש הסעה או השכרת רכב עבורו. זה חוסר בנתונים שלנו, לא קביעה שאין כאלה.',
  'book.arriveAt': 'נחיתה ב',
  'book.setTrip': 'הגדרת תאריכים ומוצא',
  'book.unverifiedUrls':
    'מבני הקישורים האלה הם הקריאה הטובה ביותר שלנו של כתובות החיפוש הפומביות של כל ספק, ולא אומתו מול האתרים החיים שלהם. אם קישור נוחת בטופס חיפוש ריק בלי הפרטים שלכם — זו הסיבה, מלאו אותם שם.',
  'book.affiliate':
    'קישורים המסומנים „קישור שותפים” מזכים את Searchski בעמלה אם תזמינו. הם מסומנים במקום הלחיצה, והדירוג אינו רואה אותם.',

  'israel.kosher': 'אוכל כשר',
  'israel.chabad': 'חב״ד הקרוב',
  'israel.hebrewSchool': 'בית ספר לסקי בעברית',
  'israel.shabbat': 'שבת',
  'israel.apres': 'אפרה־סקי',
  'israel.family': 'משפחות',
  'israel.gateways': 'שדות תעופה לישראלים',
  'israel.none': 'עדיין לא נבדק דבר עבור אתר זה.',
  'israel.kosher.0': 'לא ידוע על כשרות',
  'israel.kosher.1': 'מוגבל',
  'israel.kosher.2': 'טוב',
  'israel.kosher.3': 'נרחב',

  'verify.verified': 'מאומת',
  'verify.unverified': 'טרם אומת',
  'verify.stale': 'ייתכן שאינו מעודכן',
  'verify.explainUnverified':
    'אף אדם לא בדק זאת מול מקור ראשוני. התייחסו לזה כרמז ולא כעובדה — אמתו בעצמכם לפני שאתם מסתמכים על כך.',
  'verify.explainStale': 'זה אומת פעם אחת אך הבדיקה ישנה. אמתו לפני שאתם מסתמכים על כך.',
  'verify.kosherWarning': 'אין להסתמך על כך לעניין כשרות. בררו ישירות מול בית העסק או הרבנות המקומית.',

  'compare.title': 'השוואת אתרים',
  'compare.empty': 'הוסיפו עד ארבעה אתרים מתוצאות החיפוש כדי להשוות ביניהם.',
  'compare.remove': 'הסר מההשוואה',
  'compare.limit': 'אפשר להשוות עד ארבעה אתרים בבת אחת.',
  'compare.back': 'חזרה לחיפוש',

  'banner.sample':
    'מוצג מאגר הדגמה מובנה. ה-ETL עדיין לא הורץ, ולכן המספרים הם מצייני מקום — שום דבר כאן אינו נתון שנחקר.',
  'banner.source': 'מקור הנתונים',

  'outbound.label': 'נפתח באתר צד שלישי',
  'outbound.aria': 'קישור חיצוני, נפתח בלשונית חדשה',

  'about.title': 'על הנתונים',
  'footer.attribution': 'נתוני אתרי סקי © OpenSkiMap ותורמי OpenStreetMap, רישיון ODbL.',
  'footer.notOperator': 'Searchski הוא שירות הפניה, לא סוכנות נסיעות.',
  'error.generic': 'משהו השתבש. שום דבר לא אבד — נסו שוב.',
  'notFound.title': 'הדף לא נמצא',
  'notFound.body': 'הדף הזה לא קיים.',
};

export const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = {
  en,
  he,
};

export type Translate = (key: MessageKey) => string;

export function makeTranslator(locale: Locale): Translate {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return (key) => dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
}
