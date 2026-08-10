# Lift-pass prices — 2025/26

Generated 2026-07-26T21:38:34.408Z by `npm run prices:discover`.

Every row in `pass_prices.json` is stored as **`verification: unverified`**. Per the repo rules (README, "Curated data is a claim until a human verifies it") none of it may be shown as bare fact — it renders as *"€X as listed on domain.com, checked <date>"*, or not at all.

> This run was limited to `--countries=BG`. The coverage table below still counts the whole significant roster, so the other countries show as *not yet checked* rather than disappearing.

## Coverage by country

| Country | Significant resorts | With a price | of which dynamic | No price found | Errored | Not yet checked |
|---|---:|---:|---:|---:|---:|---:|
| AD | 4 | 0 | 0 | 0 | 0 | 4 |
| AT | 172 | 0 | 0 | 0 | 0 | 172 |
| BA | 5 | 0 | 0 | 0 | 0 | 5 |
| BG | 5 | 1 | 1 | 2 | 0 | 2 |
| CH | 134 | 0 | 0 | 0 | 0 | 134 |
| CZ | 26 | 0 | 0 | 0 | 0 | 26 |
| DE | 44 | 0 | 0 | 0 | 0 | 44 |
| ES | 29 | 0 | 0 | 0 | 0 | 29 |
| FI | 19 | 0 | 0 | 0 | 0 | 19 |
| FR | 160 | 0 | 0 | 0 | 0 | 160 |
| GE | 7 | 0 | 0 | 0 | 0 | 7 |
| GR | 9 | 0 | 0 | 0 | 0 | 9 |
| HR | 1 | 0 | 0 | 0 | 0 | 1 |
| IT | 167 | 0 | 0 | 0 | 0 | 167 |
| LI | 1 | 0 | 0 | 0 | 0 | 1 |
| ME | 1 | 0 | 0 | 0 | 0 | 1 |
| MK | 3 | 0 | 0 | 0 | 0 | 3 |
| NO | 53 | 0 | 0 | 0 | 0 | 53 |
| PL | 17 | 0 | 0 | 0 | 0 | 17 |
| RO | 10 | 0 | 0 | 0 | 0 | 10 |
| RS | 4 | 0 | 0 | 0 | 0 | 4 |
| SE | 37 | 0 | 0 | 0 | 0 | 37 |
| SI | 11 | 0 | 0 | 0 | 0 | 11 |
| SK | 17 | 0 | 0 | 0 | 0 | 17 |
| TR | 9 | 0 | 0 | 0 | 0 | 9 |
| UA | 6 | 0 | 0 | 0 | 0 | 6 |
| **All** | **951** | **1** | **1** | **2** | **0** | **948** |

## Needs human checking — the page never named the season

No stored 2025/26 row is standing on an assumed season.

## Dynamic pricing — the stored figure is a floor, not the price

These operators price by date or demand. `isDynamic` is set on every row below and the UI must present the number as a *starting* price, never as what a skier will pay.

| Resort | Country | From (1-day) | From (6-day) | Source |
|---|---|---|---|---|
| Borovets | BG | EUR 43 | — | borovets-bg.com |

## Still missing a price

950 of 951 significant resorts have no 2025/26 price. These render as **"not available"** — which is the correct outcome, not a bug.

| Resort | Country | Status | Reason |
|---|---|---|---|
| Canaro | AD | not yet checked | not queried in any run so far |
| GrandValira | AD | not yet checked | not queried in any run so far |
| Ordino-Arcalis | AD | not yet checked | not queried in any run so far |
| Pal-Arinsal | AD | not yet checked | not queried in any run so far |
| 11er Neustift | AT | not yet checked | not queried in any run so far |
| Aflenzer Bürgeralm | AT | not yet checked | not queried in any run so far |
| Ankogel Mallnitz | AT | not yet checked | not queried in any run so far |
| Annaberg | AT | not yet checked | not queried in any run so far |
| Axamer Lizum - Muttereralm | AT | not yet checked | not queried in any run so far |
| Bad Kleinkirchheim | AT | not yet checked | not queried in any run so far |
| Bergbahn Weissensee | AT | not yet checked | not queried in any run so far |
| Bergbahnen Werfenweng | AT | not yet checked | not queried in any run so far |
| Bergeralm | AT | not yet checked | not queried in any run so far |
| Berwang | AT | not yet checked | not queried in any run so far |
| Biberwier - Marienberg | AT | not yet checked | not queried in any run so far |
| Bödele | AT | not yet checked | not queried in any run so far |
| Brandnertal – Brand | AT | not yet checked | not queried in any run so far |
| Brunnalm | AT | not yet checked | not queried in any run so far |
| Brunnalm - Hohe Veitsch | AT | not yet checked | not queried in any run so far |
| Buchensteinwand (Pillersee) | AT | not yet checked | not queried in any run so far |
| Christlum | AT | not yet checked | not queried in any run so far |
| Damüls | AT | not yet checked | not queried in any run so far |
| Dreiländereck - Arnoldstein | AT | not yet checked | not queried in any run so far |
| Ehrwalder Alm | AT | not yet checked | not queried in any run so far |
| Fageralm | AT | not yet checked | not queried in any run so far |
| Fanningberg | AT | not yet checked | not queried in any run so far |
| Fendels | AT | not yet checked | not queried in any run so far |
| Feuerkogel | AT | not yet checked | not queried in any run so far |
| Filzmoos-Neuberg | AT | not yet checked | not queried in any run so far |
| Flachau | AT | not yet checked | not queried in any run so far |
| Freesports Arena Dachstein Krippenstein | AT | not yet checked | not queried in any run so far |
| Füssener Jöchle-Grän | AT | not yet checked | not queried in any run so far |
| Gaaler Lifte | AT | not yet checked | not queried in any run so far |
| Galsterberg | AT | not yet checked | not queried in any run so far |
| Galtür | AT | not yet checked | not queried in any run so far |
| Gargellen | AT | not yet checked | not queried in any run so far |
| Gemeindealpe Mitterbach | AT | not yet checked | not queried in any run so far |
| Gerlitzen Alpe | AT | not yet checked | not queried in any run so far |
| Gerlosstein | AT | not yet checked | not queried in any run so far |
| Glungezer | AT | not yet checked | not queried in any run so far |
| Goldeck | AT | not yet checked | not queried in any run so far |
| Golm | AT | not yet checked | not queried in any run so far |
| Golzentipp | AT | not yet checked | not queried in any run so far |
| Graukogel | AT | not yet checked | not queried in any run so far |
| Grebenzen | AT | not yet checked | not queried in any run so far |
| Großarltal-Dorfgastein | AT | not yet checked | not queried in any run so far |
| Großeck-Speiereck | AT | not yet checked | not queried in any run so far |
| Großglockner Heiligenblut | AT | not yet checked | not queried in any run so far |
| Gurtis | AT | not yet checked | not queried in any run so far |
| Hahnenkamm | AT | not yet checked | not queried in any run so far |
| Hauser Kaibling | AT | not yet checked | not queried in any run so far |
| Heidialm | AT | not yet checked | not queried in any run so far |
| Heutal | AT | not yet checked | not queried in any run so far |
| Hinterstoder | AT | not yet checked | not queried in any run so far |
| Hintertuxer Gletscher | AT | not yet checked | not queried in any run so far |
| Hoch-Imst | AT | not yet checked | not queried in any run so far |
| Hochkar | AT | not yet checked | not queried in any run so far |
| Hochkeil | AT | not yet checked | not queried in any run so far |
| Hochkönig | AT | not yet checked | not queried in any run so far |
| Hochkössen - Unterberghorn | AT | not yet checked | not queried in any run so far |
| Hochoetz | AT | not yet checked | not queried in any run so far |
| Hochoetz-Kühtai | AT | not yet checked | not queried in any run so far |
| Hochrindl | AT | not yet checked | not queried in any run so far |
| Hochstein | AT | not yet checked | not queried in any run so far |
| Hochzeiger | AT | not yet checked | not queried in any run so far |
| Hochzillertal-Hochfügen | AT | not yet checked | not queried in any run so far |
| Hohentauern | AT | not yet checked | not queried in any run so far |
| Innerkrems | AT | not yet checked | not queried in any run so far |
| Kals-Matrei | AT | not yet checked | not queried in any run so far |
| Kappl | AT | not yet checked | not queried in any run so far |
| Kaprun - Kitzsteinhorn | AT | not yet checked | not queried in any run so far |
| Karkogel - Abtenau | AT | not yet checked | not queried in any run so far |
| Karwendel Bergbahn | AT | not yet checked | not queried in any run so far |
| Kasberg Grünau - Almtal | AT | not yet checked | not queried in any run so far |
| Katschberg-Aineck | AT | not yet checked | not queried in any run so far |
| Kaunertaler Gletscher | AT | not yet checked | not queried in any run so far |
| KitzSki | AT | not yet checked | not queried in any run so far |
| Klippitztörl | AT | not yet checked | not queried in any run so far |
| Königsberg - Hollenstein | AT | not yet checked | not queried in any run so far |
| Koralpe | AT | not yet checked | not queried in any run so far |
| Kreischberg | AT | not yet checked | not queried in any run so far |
| Kühtai | AT | not yet checked | not queried in any run so far |
| Lachtal | AT | not yet checked | not queried in any run so far |
| Lackenhof - Ötscher | AT | not yet checked | not queried in any run so far |
| Laterns-Gapfohl | AT | not yet checked | not queried in any run so far |
| Lech | AT | not yet checked | not queried in any run so far |
| Lermoos Grubigstein | AT | not yet checked | not queried in any run so far |
| Lienz - Zettersfeld | AT | not yet checked | not queried in any run so far |
| Lienzer Bergbahnen | AT | not yet checked | not queried in any run so far |
| Loser-Altaussee | AT | not yet checked | not queried in any run so far |
| Mariazell - Bürgeralpe | AT | not yet checked | not queried in any run so far |
| Mayrhofen Hippach | AT | not yet checked | not queried in any run so far |
| Mellau | AT | not yet checked | not queried in any run so far |
| Mölltaler Gletscher | AT | not yet checked | not queried in any run so far |
| Mönichkirchen - Mariensee | AT | not yet checked | not queried in any run so far |
| Nassfeld | AT | not yet checked | not queried in any run so far |
| Nauders Bergkastel | AT | not yet checked | not queried in any run so far |
| Niederalpl | AT | not yet checked | not queried in any run so far |
| Niederau (Wildschönau) | AT | not yet checked | not queried in any run so far |
| Nordkette | AT | not yet checked | not queried in any run so far |
| Obergurgl-Hochgurgl | AT | not yet checked | not queried in any run so far |
| Obertauern | AT | not yet checked | not queried in any run so far |
| Patscherkofel Ski | AT | not yet checked | not queried in any run so far |
| Pitztaler Gletscher | AT | not yet checked | not queried in any run so far |
| Planai & Hochwurzen | AT | not yet checked | not queried in any run so far |
| Planneralm | AT | not yet checked | not queried in any run so far |
| Postalm | AT | not yet checked | not queried in any run so far |
| Präbichl | AT | not yet checked | not queried in any run so far |
| Radstadt - Altenmarkt | AT | not yet checked | not queried in any run so far |
| Raggal | AT | not yet checked | not queried in any run so far |
| Ramsau am Dachstein | AT | not yet checked | not queried in any run so far |
| Rangger Köpfl | AT | not yet checked | not queried in any run so far |
| Raurisertal | AT | not yet checked | not queried in any run so far |
| Reiteralm | AT | not yet checked | not queried in any run so far |
| Rieseralm | AT | not yet checked | not queried in any run so far |
| Riesneralm - Donnersbachwald | AT | not yet checked | not queried in any run so far |
| Rifflsee | AT | not yet checked | not queried in any run so far |
| Rofan Seilbahn | AT | not yet checked | not queried in any run so far |
| Salzstiegl | AT | not yet checked | not queried in any run so far |
| Schladming Dachstein | AT | not yet checked | not queried in any run so far |
| Schlick 2000 | AT | not yet checked | not queried in any run so far |
| Schmittenhöhe Zell am See | AT | not yet checked | not queried in any run so far |
| See | AT | not yet checked | not queried in any run so far |
| Seefeld - Gschwandtkopf | AT | not yet checked | not queried in any run so far |
| Seefeld - Rosshütte | AT | not yet checked | not queried in any run so far |
| Serfaus Fiss Ladis | AT | not yet checked | not queried in any run so far |
| Serlesbahnen | AT | not yet checked | not queried in any run so far |
| Shuttleberg Flachauwinkl-Kleinarl | AT | not yet checked | not queried in any run so far |
| Sillian - Hochpustertal | AT | not yet checked | not queried in any run so far |
| Silvretta Arena Ischgl | AT | not yet checked | not queried in any run so far |
| Silvretta Montafon | AT | not yet checked | not queried in any run so far |
| Simonhöhe | AT | not yet checked | not queried in any run so far |
| Ski amadé | AT | not yet checked | not queried in any run so far |
| Ski Gastein - Schlossalm | AT | not yet checked | not queried in any run so far |
| Ski Juwel Alpbachtal-Wildschönau | AT | not yet checked | not queried in any run so far |
| Skicircus Saalbach-Hinterglemm Leogang Fieberbrunn | AT | not yet checked | not queried in any run so far |
| Skigebiet Almenwelt Lofer | AT | not yet checked | not queried in any run so far |
| Skigebiet Damüls-Mellau | AT | not yet checked | not queried in any run so far |
| Skigebiet Damüls-Mellau-Faschina | AT | not yet checked | not queried in any run so far |
| Skigebiet Diedamskopf | AT | not yet checked | not queried in any run so far |
| Skigebiet Ehrwalder Wettersteinbahnen | AT | not yet checked | not queried in any run so far |
| Skigebiet Fellhorn | AT | not yet checked | not queried in any run so far |
| Skigebiet Fontanella-Faschina | AT | not yet checked | not queried in any run so far |
| Skigebiet Heuberg Arena | AT | not yet checked | not queried in any run so far |
| Skigebiet Hochhäderich | AT | not yet checked | not queried in any run so far |
| Skigebiet Niedere (Andelsbuch-Bezau) | AT | not yet checked | not queried in any run so far |
| Skigebiet Petzen | AT | not yet checked | not queried in any run so far |
| Skigebiet Schetteregg | AT | not yet checked | not queried in any run so far |
| Skiregion Dachstein West | AT | not yet checked | not queried in any run so far |
| SkiWelt Wilder Kaiser - Brixental | AT | not yet checked | not queried in any run so far |
| Snow Space Salzburg | AT | not yet checked | not queried in any run so far |
| Sölden | AT | not yet checked | not queried in any run so far |
| Sonnenkopf | AT | not yet checked | not queried in any run so far |
| Sonntag Stein | AT | not yet checked | not queried in any run so far |
| Spieljoch - Fügen | AT | not yet checked | not queried in any run so far |
| Sportgastein | AT | not yet checked | not queried in any run so far |
| St Johann in Tirol | AT | not yet checked | not queried in any run so far |
| St. Anton | AT | not yet checked | not queried in any run so far |
| Steinplatte Waidring-Tirol | AT | not yet checked | not queried in any run so far |
| Stubai | AT | not yet checked | not queried in any run so far |
| Stubaier Gletscher | AT | not yet checked | not queried in any run so far |
| Stuhleck - Semmering | AT | not yet checked | not queried in any run so far |
| Tauplitz | AT | not yet checked | not queried in any run so far |
| Turracher Höhe | AT | not yet checked | not queried in any run so far |
| Unterberg | AT | not yet checked | not queried in any run so far |
| Venet | AT | not yet checked | not queried in any run so far |
| Vent | AT | not yet checked | not queried in any run so far |
| Wagrain | AT | not yet checked | not queried in any run so far |
| Warth-Schröcken | AT | not yet checked | not queried in any run so far |
| Weinebene | AT | not yet checked | not queried in any run so far |
| Weißsee Gletscherwelt | AT | not yet checked | not queried in any run so far |
| Wildkogel | AT | not yet checked | not queried in any run so far |
| Wurzeralm | AT | not yet checked | not queried in any run so far |
| Zahmer Kaiser | AT | not yet checked | not queried in any run so far |
| Zauchensee-Flachauwinkl | AT | not yet checked | not queried in any run so far |
| Zillertal Arena | AT | not yet checked | not queried in any run so far |
| Jahorina olimpijski centar | BA | not yet checked | not queried in any run so far |
| Kupres | BA | not yet checked | not queried in any run so far |
| OC Bjelašnica ZOI '84 | BA | not yet checked | not queried in any run so far |
| Ski centar "Ravna Planina" | BA | not yet checked | not queried in any run so far |
| Ski centar Vlašić | BA | not yet checked | not queried in any run so far |
| Bansko | BG | not found | Official price page located and season named (01.12.2025-12.04.2026), but no price figures were read. |
| Pamporovo | BG | not found | Operator price list for 2025/2026 identified but price table not readable; period-dependent promo pricing noted. |
| Tschepelare | BG | not yet checked | not queried in any run so far |
| Vitosha | BG | not yet checked | not queried in any run so far |
| 4 Vallées – Verbier | CH | not yet checked | not queried in any run so far |
| Adelboden - Lenk | CH | not yet checked | not queried in any run so far |
| Adelboden - TschentenAlp | CH | not yet checked | not queried in any run so far |
| Aeschiallmend | CH | not yet checked | not queried in any run so far |
| Airolo Pesciüm | CH | not yet checked | not queried in any run so far |
| Aletsch Arena | CH | not yet checked | not queried in any run so far |
| Amden Arvenbüel | CH | not yet checked | not queried in any run so far |
| Amden Mattstock | CH | not yet checked | not queried in any run so far |
| Anzère | CH | not yet checked | not queried in any run so far |
| Arolla | CH | not yet checked | not queried in any run so far |
| Arosa Lenzerheide | CH | not yet checked | not queried in any run so far |
| Atzmännig | CH | not yet checked | not queried in any run so far |
| Axalp | CH | not yet checked | not queried in any run so far |
| Belalp | CH | not yet checked | not queried in any run so far |
| Bellwald | CH | not yet checked | not queried in any run so far |
| Bergün | CH | not yet checked | not queried in any run so far |
| Biel - Kinzig | CH | not yet checked | not queried in any run so far |
| Bivio | CH | not yet checked | not queried in any run so far |
| Bosco Gurin – Grossalp | CH | not yet checked | not queried in any run so far |
| Brambrüesch | CH | not yet checked | not queried in any run so far |
| Braunwald | CH | not yet checked | not queried in any run so far |
| Brigels-Waltensburg-Andiast | CH | not yet checked | not queried in any run so far |
| Brunni-Haggenegg | CH | not yet checked | not queried in any run so far |
| Brunni-Holzegg-Rotenflue | CH | not yet checked | not queried in any run so far |
| Bugnenets-Savagnières | CH | not yet checked | not queried in any run so far |
| Bürchen - Törbel | CH | not yet checked | not queried in any run so far |
| Cari | CH | not yet checked | not queried in any run so far |
| Champéry – Les Crosets – Champoussin – Morgins | CH | not yet checked | not queried in any run so far |
| Champex-Lac | CH | not yet checked | not queried in any run so far |
| Charmey | CH | not yet checked | not queried in any run so far |
| Chäserrugg-Alt St. Johann | CH | not yet checked | not queried in any run so far |
| Confin | CH | not yet checked | not queried in any run so far |
| Corvatsch-Furtschellas | CH | not yet checked | not queried in any run so far |
| Corviglia | CH | not yet checked | not queried in any run so far |
| Crans-Montana | CH | not yet checked | not queried in any run so far |
| Degersheim | CH | not yet checked | not queried in any run so far |
| Dent de Vaulion – Le Morez | CH | not yet checked | not queried in any run so far |
| Diavolezza-Lagalb | CH | not yet checked | not queried in any run so far |
| Disentis | CH | not yet checked | not queried in any run so far |
| Ebenalp-Horn | CH | not yet checked | not queried in any run so far |
| Elm | CH | not yet checked | not queried in any run so far |
| Elsigenalp | CH | not yet checked | not queried in any run so far |
| Engelberg - Ristis-Brunni | CH | not yet checked | not queried in any run so far |
| Engstligenalp | CH | not yet checked | not queried in any run so far |
| Eriz | CH | not yet checked | not queried in any run so far |
| Evolène | CH | not yet checked | not queried in any run so far |
| Feldis | CH | not yet checked | not queried in any run so far |
| Fideriser Heuberge | CH | not yet checked | not queried in any run so far |
| Flumserberg | CH | not yet checked | not queried in any run so far |
| Glacier 3000 | CH | not yet checked | not queried in any run so far |
| Grächen | CH | not yet checked | not queried in any run so far |
| Grimmialp | CH | not yet checked | not queried in any run so far |
| Grindelwald - Männlichen (Schlittelpiste) | CH | not yet checked | not queried in any run so far |
| Grindelwald - Wengen (Kleine Scheidegg - Männlichen) | CH | not yet checked | not queried in any run so far |
| Grindelwald First | CH | not yet checked | not queried in any run so far |
| Grüsch-Danusa | CH | not yet checked | not queried in any run so far |
| Gstaad - Saanen - Rougemont | CH | not yet checked | not queried in any run so far |
| Hoch-Ybrig | CH | not yet checked | not queried in any run so far |
| Hochwang | CH | not yet checked | not queried in any run so far |
| Hohwald Beatenberg | CH | not yet checked | not queried in any run so far |
| Ibergeregg-Handgruobi | CH | not yet checked | not queried in any run so far |
| Jakobshorn | CH | not yet checked | not queried in any run so far |
| Jaun-Gastlosen Bergbahnen | CH | not yet checked | not queried in any run so far |
| Jeizinen | CH | not yet checked | not queried in any run so far |
| Kandersteg | CH | not yet checked | not queried in any run so far |
| Klewenalp - Stockhütte | CH | not yet checked | not queried in any run so far |
| L'Abbaye | CH | not yet checked | not queried in any run so far |
| La Berra | CH | not yet checked | not queried in any run so far |
| La Corbatière | CH | not yet checked | not queried in any run so far |
| La Forclaz | CH | not yet checked | not queried in any run so far |
| La Fouly | CH | not yet checked | not queried in any run so far |
| La Robella | CH | not yet checked | not queried in any run so far |
| Laax | CH | not yet checked | not queried in any run so far |
| Lauchernalp | CH | not yet checked | not queried in any run so far |
| Lenk - Wallegg | CH | not yet checked | not queried in any run so far |
| Les Marecottes | CH | not yet checked | not queried in any run so far |
| Les Mosses | CH | not yet checked | not queried in any run so far |
| Les Paccots | CH | not yet checked | not queried in any run so far |
| Les Pléiades | CH | not yet checked | not queried in any run so far |
| Les Rousses | CH | not yet checked | not queried in any run so far |
| Leukerbad (Torrent) | CH | not yet checked | not queried in any run so far |
| Leysin | CH | not yet checked | not queried in any run so far |
| Madrisa | CH | not yet checked | not queried in any run so far |
| Marbachegg | CH | not yet checked | not queried in any run so far |
| Meiringen - Hasliberg | CH | not yet checked | not queried in any run so far |
| Melchsee-Frutt | CH | not yet checked | not queried in any run so far |
| Minschuns | CH | not yet checked | not queried in any run so far |
| Moléson | CH | not yet checked | not queried in any run so far |
| Mörlialp | CH | not yet checked | not queried in any run so far |
| Mürren | CH | not yet checked | not queried in any run so far |
| Nara | CH | not yet checked | not queried in any run so far |
| Nax - Mont Noble | CH | not yet checked | not queried in any run so far |
| Niederhorn | CH | not yet checked | not queried in any run so far |
| Obersaxen | CH | not yet checked | not queried in any run so far |
| Ovronnaz | CH | not yet checked | not queried in any run so far |
| Parsenn | CH | not yet checked | not queried in any run so far |
| Pizol | CH | not yet checked | not queried in any run so far |
| Rathvel | CH | not yet checked | not queried in any run so far |
| Rigi | CH | not yet checked | not queried in any run so far |
| Rinerhorn | CH | not yet checked | not queried in any run so far |
| Rochers-de-Naye | CH | not yet checked | not queried in any run so far |
| Saas Fee | CH | not yet checked | not queried in any run so far |
| Saas Grund | CH | not yet checked | not queried in any run so far |
| Saas-Almagell - Furggstalden | CH | not yet checked | not queried in any run so far |
| Saint-Luc - Chandolin | CH | not yet checked | not queried in any run so far |
| Sainte-Croix | CH | not yet checked | not queried in any run so far |
| Sattel-Hochstuckli | CH | not yet checked | not queried in any run so far |
| Savognin | CH | not yet checked | not queried in any run so far |
| Schatzalp | CH | not yet checked | not queried in any run so far |
| Schönried - Saanenmöser - Zweisimmen - St. Stephan | CH | not yet checked | not queried in any run so far |
| Schwarzsee | CH | not yet checked | not queried in any run so far |
| Scuol Motta Naluns | CH | not yet checked | not queried in any run so far |
| Sigriswill-Schwanden | CH | not yet checked | not queried in any run so far |
| Skiarena | CH | not yet checked | not queried in any run so far |
| Skilifte Ibergeregg | CH | not yet checked | not queried in any run so far |
| Skipisten Titlis Bergbahnen | CH | not yet checked | not queried in any run so far |
| Sörenberg | CH | not yet checked | not queried in any run so far |
| Splügen-Tambo | CH | not yet checked | not queried in any run so far |
| Stoos | CH | not yet checked | not queried in any run so far |
| Tramelan | CH | not yet checked | not queried in any run so far |
| Tschappina Heinzenberg | CH | not yet checked | not queried in any run so far |
| Tschiertschen | CH | not yet checked | not queried in any run so far |
| Unterbäch - Eischoll | CH | not yet checked | not queried in any run so far |
| Vals | CH | not yet checked | not queried in any run so far |
| Vercorin | CH | not yet checked | not queried in any run so far |
| Vichères-Bavon | CH | not yet checked | not queried in any run so far |
| Villars | CH | not yet checked | not queried in any run so far |
| Visperterminen | CH | not yet checked | not queried in any run so far |
| Wildhaus | CH | not yet checked | not queried in any run so far |
| Wiriehorn | CH | not yet checked | not queried in any run so far |
| Wolzenalp | CH | not yet checked | not queried in any run so far |
| Zermatt - Breuil-Cervinia | CH | not yet checked | not queried in any run so far |
| Zinal | CH | not yet checked | not queried in any run so far |
| Zuoz | CH | not yet checked | not queried in any run so far |
| Bouřňák | CZ | not yet checked | not queried in any run so far |
| Boží Dar | CZ | not yet checked | not queried in any run so far |
| Dolní Morava sport & relax resort | CZ | not yet checked | not queried in any run so far |
| Harrachov | CZ | not yet checked | not queried in any run so far |
| Herlíkovice | CZ | not yet checked | not queried in any run so far |
| Hochficht-Böhmerwald | CZ | not yet checked | not queried in any run so far |
| Horský resort Buková hora | CZ | not yet checked | not queried in any run so far |
| Janské Lázně - Černá hora | CZ | not yet checked | not queried in any run so far |
| Kouty | CZ | not yet checked | not queried in any run so far |
| Malá Úpa | CZ | not yet checked | not queried in any run so far |
| Paseky nad Jizerou | CZ | not yet checked | not queried in any run so far |
| Pec pod Sněžkou | CZ | not yet checked | not queried in any run so far |
| Ramzová | CZ | not yet checked | not queried in any run so far |
| Ski areál Lipno-Kramolín | CZ | not yet checked | not queried in any run so far |
| Ski Králičák | CZ | not yet checked | not queried in any run so far |
| Ski&Bike Špičák | CZ | not yet checked | not queried in any run so far |
| Skiareál Horní Domky - Lysá Hora | CZ | not yet checked | not queried in any run so far |
| Skiareál Ještěd | CZ | not yet checked | not queried in any run so far |
| Skiareál Klínovec | CZ | not yet checked | not queried in any run so far |
| Skiareál Plešivec | CZ | not yet checked | not queried in any run so far |
| Skiareál Špindlerův Mlýn - Medvědín | CZ | not yet checked | not queried in any run so far |
| Skiarena Jizerky | CZ | not yet checked | not queried in any run so far |
| Skiresort Černá Hora-Pec | CZ | not yet checked | not queried in any run so far |
| Svatý Petr - Pláň | CZ | not yet checked | not queried in any run so far |
| Tanvaldský Špičák | CZ | not yet checked | not queried in any run so far |
| Zadní Telnice | CZ | not yet checked | not queried in any run so far |
| Adelharz- und Breitensteinlifte (Kranzegg am Grünten) | DE | not yet checked | not queried in any run so far |
| Balderschwang – Hochschelpen | DE | not yet checked | not queried in any run so far |
| Brauneck | DE | not yet checked | not queried in any run so far |
| Feldberg | DE | not yet checked | not queried in any run so far |
| Geißkopf | DE | not yet checked | not queried in any run so far |
| Gletscher-Skigebiet Zugspitze | DE | not yet checked | not queried in any run so far |
| Götschenkopf | DE | not yet checked | not queried in any run so far |
| Grasgehren | DE | not yet checked | not queried in any run so far |
| Großer Arber | DE | not yet checked | not queried in any run so far |
| Haldenköpfle | DE | not yet checked | not queried in any run so far |
| Hindelang Oberjoch | DE | not yet checked | not queried in any run so far |
| Hinterstaufen | DE | not yet checked | not queried in any run so far |
| Hochlitten-Riefensberg | DE | not yet checked | not queried in any run so far |
| Hörnerbahn Bolsterlang | DE | not yet checked | not queried in any run so far |
| Kampenwand | DE | not yet checked | not queried in any run so far |
| Kreuzberg | DE | not yet checked | not queried in any run so far |
| Mittenwald - Kranzberg | DE | not yet checked | not queried in any run so far |
| Mitterdorf | DE | not yet checked | not queried in any run so far |
| Muggenbrunn | DE | not yet checked | not queried in any run so far |
| Münstertal-Wieden | DE | not yet checked | not queried in any run so far |
| Nesselwang - Alpspitzbahnen | DE | not yet checked | not queried in any run so far |
| Neuastenberg Postwiese | DE | not yet checked | not queried in any run so far |
| Ochsenkopf | DE | not yet checked | not queried in any run so far |
| Ofterschwang | DE | not yet checked | not queried in any run so far |
| Rossfeld | DE | not yet checked | not queried in any run so far |
| Skiarena Steibis | DE | not yet checked | not queried in any run so far |
| Skigebiet Arnsberglifte | DE | not yet checked | not queried in any run so far |
| Skigebiet Garmisch-Classic | DE | not yet checked | not queried in any run so far |
| Skigebiet Ifen | DE | not yet checked | not queried in any run so far |
| Skigebiet Nebelhorn | DE | not yet checked | not queried in any run so far |
| Skigebiet Oberwiesenthal | DE | not yet checked | not queried in any run so far |
| Skigebiet Söllereck | DE | not yet checked | not queried in any run so far |
| Skigebiet Spitzingsee - Tegernsee | DE | not yet checked | not queried in any run so far |
| Skiliftkarussell Altastenberg | DE | not yet checked | not queried in any run so far |
| Skiliftkarussell Winterberg | DE | not yet checked | not queried in any run so far |
| Sudelfeld - Bayrischzell | DE | not yet checked | not queried in any run so far |
| Tannheim-Zöblen-Schattwald | DE | not yet checked | not queried in any run so far |
| Todtnauberg | DE | not yet checked | not queried in any run so far |
| Unnamed ski area (e076e240) | DE | not yet checked | not queried in any run so far |
| Wendelstein | DE | not yet checked | not queried in any run so far |
| Wildewiese | DE | not yet checked | not queried in any run so far |
| Willingen | DE | not yet checked | not queried in any run so far |
| Wintersport Arena Holzelfingen | DE | not yet checked | not queried in any run so far |
| Wintersportgebiet Wurmberg | DE | not yet checked | not queried in any run so far |
| Astun | ES | not yet checked | not queried in any run so far |
| Boí Taüll | ES | not yet checked | not queried in any run so far |
| Candanchu | ES | not yet checked | not queried in any run so far |
| Cerler | ES | not yet checked | not queried in any run so far |
| Espot | ES | not yet checked | not queried in any run so far |
| Estació d'Esquí Baqueira-Beret | ES | not yet checked | not queried in any run so far |
| Estació d'esquí de Port-Ainé | ES | not yet checked | not queried in any run so far |
| Estació d'esquí i muntanya Vallter 2000 | ES | not yet checked | not queried in any run so far |
| Estació d'esquí Port del Comte | ES | not yet checked | not queried in any run so far |
| Estació de muntanya Vall de Núria | ES | not yet checked | not queried in any run so far |
| Estación de Esquí de Manzaneda | ES | not yet checked | not queried in any run so far |
| Estación de esquí de Valdesquí | ES | not yet checked | not queried in any run so far |
| Estación de esquí de Valdezcaray | ES | not yet checked | not queried in any run so far |
| Estación de Esquí y Montaña Alto Campoo | ES | not yet checked | not queried in any run so far |
| Estación de Esquí y Montaña de Sierra Nevada | ES | not yet checked | not queried in any run so far |
| Estación Invernal Fuentes de Invierno | ES | not yet checked | not queried in any run so far |
| Estación Invernal y de Montaña San Isidro (Sector Cebolledo y Requejines) | ES | not yet checked | not queried in any run so far |
| Estación Invernal y de Montaña San Isidro (Sector Saliencias) | ES | not yet checked | not queried in any run so far |
| Estación Invernal y de Montaña Valgrande-Pajares | ES | not yet checked | not queried in any run so far |
| Formigal | ES | not yet checked | not queried in any run so far |
| Javalambre | ES | not yet checked | not queried in any run so far |
| La Covatilla | ES | not yet checked | not queried in any run so far |
| La Molina | ES | not yet checked | not queried in any run so far |
| La Pinilla | ES | not yet checked | not queried in any run so far |
| Leitariegos | ES | not yet checked | not queried in any run so far |
| Masella | ES | not yet checked | not queried in any run so far |
| Panticosa | ES | not yet checked | not queried in any run so far |
| Rasos de Peguera | ES | not yet checked | not queried in any run so far |
| Valdelinares | ES | not yet checked | not queried in any run so far |
| Hiihtokeskus Himosvuori | FI | not yet checked | not queried in any run so far |
| Hiihtokeskus Ukkohalla | FI | not yet checked | not queried in any run so far |
| Levin hiihtokeskus | FI | not yet checked | not queried in any run so far |
| Messilän Lumikeskus | FI | not yet checked | not queried in any run so far |
| Olos Ski Resort | FI | not yet checked | not queried in any run so far |
| Paljakan matkailu- ja hiihtokeskus | FI | not yet checked | not queried in any run so far |
| Pikku-Syote | FI | not yet checked | not queried in any run so far |
| Pyhä Ski Resort | FI | not yet checked | not queried in any run so far |
| Pyhätunturi - Luosto | FI | not yet checked | not queried in any run so far |
| Riihivuori Resort | FI | not yet checked | not queried in any run so far |
| Rukatunturi | FI | not yet checked | not queried in any run so far |
| Salla Ski Resort | FI | not yet checked | not queried in any run so far |
| Ski Saariselkä | FI | not yet checked | not queried in any run so far |
| Suomutunturi | FI | not yet checked | not queried in any run so far |
| Tahko | FI | not yet checked | not queried in any run so far |
| Vihti Ski Center | FI | not yet checked | not queried in any run so far |
| Vuokatinrinteet | FI | not yet checked | not queried in any run so far |
| Ylläs | FI | not yet checked | not queried in any run so far |
| Ylläs Ski Resort | FI | not yet checked | not queried in any run so far |
| Abondance | FR | not yet checked | not queried in any run so far |
| Aillon-Margériaz | FR | not yet checked | not queried in any run so far |
| Albiez-Montrond | FR | not yet checked | not queried in any run so far |
| Alpe d'Huez Grand Domaine | FR | not yet checked | not queried in any run so far |
| Ancelle | FR | not yet checked | not queried in any run so far |
| Arêches Beaufort | FR | not yet checked | not queried in any run so far |
| Artouste | FR | not yet checked | not queried in any run so far |
| Ascou | FR | not yet checked | not queried in any run so far |
| Auron | FR | not yet checked | not queried in any run so far |
| Aussois | FR | not yet checked | not queried in any run so far |
| Autrans - Grand domaine la Sure | FR | not yet checked | not queried in any run so far |
| Avoriaz | FR | not yet checked | not queried in any run so far |
| Ax 3 Domaines | FR | not yet checked | not queried in any run so far |
| Ballon d'Alsace | FR | not yet checked | not queried in any run so far |
| Balme - Vallorcine | FR | not yet checked | not queried in any run so far |
| Bernex | FR | not yet checked | not queried in any run so far |
| Bonneval-sur-Arc | FR | not yet checked | not queried in any run so far |
| Brévent | FR | not yet checked | not queried in any run so far |
| Camurac | FR | not yet checked | not queried in any run so far |
| Cauterets Cirque du Lys | FR | not yet checked | not queried in any run so far |
| Chabanon | FR | not yet checked | not queried in any run so far |
| Chaillol | FR | not yet checked | not queried in any run so far |
| Chalmazel | FR | not yet checked | not queried in any run so far |
| Chamrousse | FR | not yet checked | not queried in any run so far |
| Chastreix-Sancy | FR | not yet checked | not queried in any run so far |
| Claviere | FR | not yet checked | not queried in any run so far |
| Crévoux | FR | not yet checked | not queried in any run so far |
| Dévoluy | FR | not yet checked | not queried in any run so far |
| Domaine Alpin du Col d'Ornon | FR | not yet checked | not queried in any run so far |
| Domaine Autrans - Méaudre | FR | not yet checked | not queried in any run so far |
| Domaine Skiable Chamrousse | FR | not yet checked | not queried in any run so far |
| Domaine Skiable Saint-Léger-Les-Mélèzes | FR | not yet checked | not queried in any run so far |
| Domaine skiable Valberg | FR | not yet checked | not queried in any run so far |
| Espace Cambre d'Aze | FR | not yet checked | not queried in any run so far |
| Espace Diamant | FR | not yet checked | not queried in any run so far |
| Espace Haute Maurienne Vanoise | FR | not yet checked | not queried in any run so far |
| Espace Liberté | FR | not yet checked | not queried in any run so far |
| Espace Lumière | FR | not yet checked | not queried in any run so far |
| Font d'Urle Chaud Clapier | FR | not yet checked | not queried in any run so far |
| Font-Romeu Pyrénées 2000 | FR | not yet checked | not queried in any run so far |
| Forêt Blanche : Vars | FR | not yet checked | not queried in any run so far |
| Formiguères | FR | not yet checked | not queried in any run so far |
| Galibier-Thabor | FR | not yet checked | not queried in any run so far |
| Gavarnie-Gèdre | FR | not yet checked | not queried in any run so far |
| Gérardmer | FR | not yet checked | not queried in any run so far |
| Gourette | FR | not yet checked | not queried in any run so far |
| Grand Ballon | FR | not yet checked | not queried in any run so far |
| Grand Tourmalet | FR | not yet checked | not queried in any run so far |
| Gréolières-Les-Neiges | FR | not yet checked | not queried in any run so far |
| Gresse en Vercors | FR | not yet checked | not queried in any run so far |
| Guzet-Neige | FR | not yet checked | not queried in any run so far |
| Hautacam | FR | not yet checked | not queried in any run so far |
| Hirmentaz - Les Habères | FR | not yet checked | not queried in any run so far |
| Isola 2000 | FR | not yet checked | not queried in any run so far |
| L'Alpe du Grand Serre | FR | not yet checked | not queried in any run so far |
| L'Audibergue | FR | not yet checked | not queried in any run so far |
| La Bresse - Hohneck | FR | not yet checked | not queried in any run so far |
| La Chapelle d'Abondance | FR | not yet checked | not queried in any run so far |
| La Clusaz | FR | not yet checked | not queried in any run so far |
| La Colmiane | FR | not yet checked | not queried in any run so far |
| La Féclaz | FR | not yet checked | not queried in any run so far |
| La Norma | FR | not yet checked | not queried in any run so far |
| La Pierre Saint-Martin | FR | not yet checked | not queried in any run so far |
| La Plagne | FR | not yet checked | not queried in any run so far |
| La Rosière | FR | not yet checked | not queried in any run so far |
| La Serra | FR | not yet checked | not queried in any run so far |
| Lac Blanc | FR | not yet checked | not queried in any run so far |
| Laguiole | FR | not yet checked | not queried in any run so far |
| Laye | FR | not yet checked | not queried in any run so far |
| Le Champ du Feu | FR | not yet checked | not queried in any run so far |
| Le Chazelet | FR | not yet checked | not queried in any run so far |
| Le Collet d'Allevard | FR | not yet checked | not queried in any run so far |
| Le Grand Domaine | FR | not yet checked | not queried in any run so far |
| Le Grand Massif | FR | not yet checked | not queried in any run so far |
| Le Grand-Bornand | FR | not yet checked | not queried in any run so far |
| Le Lioran | FR | not yet checked | not queried in any run so far |
| Le Markstein | FR | not yet checked | not queried in any run so far |
| Le Mourtis | FR | not yet checked | not queried in any run so far |
| Le Revard | FR | not yet checked | not queried in any run so far |
| Le Sauze 1400 | FR | not yet checked | not queried in any run so far |
| Le Semnoz | FR | not yet checked | not queried in any run so far |
| Les 7 Laux | FR | not yet checked | not queried in any run so far |
| Les Angles | FR | not yet checked | not queried in any run so far |
| Les Arcs | FR | not yet checked | not queried in any run so far |
| Les Contamines | FR | not yet checked | not queried in any run so far |
| Les Deux Alpes | FR | not yet checked | not queried in any run so far |
| Les Estables | FR | not yet checked | not queried in any run so far |
| Les Fourgs | FR | not yet checked | not queried in any run so far |
| Les Gets-Morzine | FR | not yet checked | not queried in any run so far |
| Les Grands Montets | FR | not yet checked | not queried in any run so far |
| Les Houches - Saint-Gervais | FR | not yet checked | not queried in any run so far |
| Les Karellis | FR | not yet checked | not queried in any run so far |
| Les Monts d'Olmes | FR | not yet checked | not queried in any run so far |
| Les Orres | FR | not yet checked | not queried in any run so far |
| Les Portes du Mont-Blanc | FR | not yet checked | not queried in any run so far |
| Les Sybelles | FR | not yet checked | not queried in any run so far |
| Les Trois Vallées | FR | not yet checked | not queried in any run so far |
| Lus la Jarjatte | FR | not yet checked | not queried in any run so far |
| Luz-Ardiden | FR | not yet checked | not queried in any run so far |
| Massif des Brasses | FR | not yet checked | not queried in any run so far |
| Méaudre | FR | not yet checked | not queried in any run so far |
| Megève | FR | not yet checked | not queried in any run so far |
| Metabief - Mont d'or | FR | not yet checked | not queried in any run so far |
| Mijanès-Donezan | FR | not yet checked | not queried in any run so far |
| Mijoux - La Faucille | FR | not yet checked | not queried in any run so far |
| Mont Saxonnex | FR | not yet checked | not queried in any run so far |
| Mont Serein | FR | not yet checked | not queried in any run so far |
| Montagnes de Lans | FR | not yet checked | not queried in any run so far |
| Montclar | FR | not yet checked | not queried in any run so far |
| Montgenèvre | FR | not yet checked | not queried in any run so far |
| Monts Jura | FR | not yet checked | not queried in any run so far |
| Mouthe | FR | not yet checked | not queried in any run so far |
| Orcières Merlette | FR | not yet checked | not queried in any run so far |
| Orelle | FR | not yet checked | not queried in any run so far |
| Passy - Plaine Joux | FR | not yet checked | not queried in any run so far |
| Pelvoux-Vallouise | FR | not yet checked | not queried in any run so far |
| Peyragudes | FR | not yet checked | not queried in any run so far |
| Piau-Engaly | FR | not yet checked | not queried in any run so far |
| Plateau de Retord | FR | not yet checked | not queried in any run so far |
| Porté-Puymorens | FR | not yet checked | not queried in any run so far |
| Pra-Loup 1600 | FR | not yet checked | not queried in any run so far |
| Pralognan-la-Vanoise | FR | not yet checked | not queried in any run so far |
| Prat-Peyrot | FR | not yet checked | not queried in any run so far |
| Praz de Lys Sommand | FR | not yet checked | not queried in any run so far |
| Puy-Saint-Vincent | FR | not yet checked | not queried in any run so far |
| Queyras - Arvieux | FR | not yet checked | not queried in any run so far |
| Queyras - Ceillac | FR | not yet checked | not queried in any run so far |
| Queyras - Haut-Guil (Abriès) | FR | not yet checked | not queried in any run so far |
| Queyras - Molines | FR | not yet checked | not queried in any run so far |
| Réallon | FR | not yet checked | not queried in any run so far |
| Roc d'Enfer | FR | not yet checked | not queried in any run so far |
| Roc d'Enfer (La Grande Terche) | FR | not yet checked | not queried in any run so far |
| Roubion-Les-Buisses | FR | not yet checked | not queried in any run so far |
| Saint François Longchamp | FR | not yet checked | not queried in any run so far |
| Saint-Hilaire-du-Touvet | FR | not yet checked | not queried in any run so far |
| Saint-Lary | FR | not yet checked | not queried in any run so far |
| Saint-Pierre-de-Chartreuse | FR | not yet checked | not queried in any run so far |
| Sainte-Anne la Condamine | FR | not yet checked | not queried in any run so far |
| Sainte-Foy Tarentaise | FR | not yet checked | not queried in any run so far |
| Serre Eyraud | FR | not yet checked | not queried in any run so far |
| Serre-Chevalier | FR | not yet checked | not queried in any run so far |
| Station de ski Bleymard Mont Lozère | FR | not yet checked | not queried in any run so far |
| Station de Ski de Brameloup | FR | not yet checked | not queried in any run so far |
| Station de ski du Schnepfenried | FR | not yet checked | not queried in any run so far |
| Station du Col de Rousset | FR | not yet checked | not queried in any run so far |
| Super Besse | FR | not yet checked | not queried in any run so far |
| Superbagnères | FR | not yet checked | not queried in any run so far |
| Terre Ronde | FR | not yet checked | not queried in any run so far |
| Thollon-les-Mémises | FR | not yet checked | not queried in any run so far |
| Tignes - Val d'Isère | FR | not yet checked | not queried in any run so far |
| Torgon | FR | not yet checked | not queried in any run so far |
| Val Cenis | FR | not yet checked | not queried in any run so far |
| Val d'Allos - La Foux | FR | not yet checked | not queried in any run so far |
| Val d'Allos - Le Seignus | FR | not yet checked | not queried in any run so far |
| Val d'Ese | FR | not yet checked | not queried in any run so far |
| Val Thorens - Orelle | FR | not yet checked | not queried in any run so far |
| Val-Louron | FR | not yet checked | not queried in any run so far |
| Valfréjus | FR | not yet checked | not queried in any run so far |
| Valmorel | FR | not yet checked | not queried in any run so far |
| Villard de Lans - Corrençon | FR | not yet checked | not queried in any run so far |
| Crystal | GE | not yet checked | not queried in any run so far |
| Didveli | GE | not yet checked | not queried in any run so far |
| Goderdzi Mountain Resort | GE | not yet checked | not queried in any run so far |
| Gudauri | GE | not yet checked | not queried in any run so far |
| Hatsvali | GE | not yet checked | not queried in any run so far |
| Kokhta - Mitarbi | GE | not yet checked | not queried in any run so far |
| Tetnuldi | GE | not yet checked | not queried in any run so far |
| 3-5 Pigadia | GR | not yet checked | not queried in any run so far |
| Elatohori | GR | not yet checked | not queried in any run so far |
| Kaimaktsalan | GR | not yet checked | not queried in any run so far |
| Kalavrita Ski Resort | GR | not yet checked | not queried in any run so far |
| Karpenisi Ski Center | GR | not yet checked | not queried in any run so far |
| Parnassos Ski Centre | GR | not yet checked | not queried in any run so far |
| Seli | GR | not yet checked | not queried in any run so far |
| Tottis Vigla | GR | not yet checked | not queried in any run so far |
| Εθνικό χιονοδρομικό κέντρο Βασιλίτσας | GR | not yet checked | not queried in any run so far |
| Platak | HR | not yet checked | not queried in any run so far |
| 3 Zinnen Dolomites (Dobbiaco - San Candido - Braies - Sesto - Alta Pusteria) | IT | not yet checked | not queried in any run so far |
| Ala di Stura | IT | not yet checked | not queried in any run so far |
| Alpe Cermis | IT | not yet checked | not queried in any run so far |
| Alpe Cimbra | IT | not yet checked | not queried in any run so far |
| Alpe del Nevegal | IT | not yet checked | not queried in any run so far |
| Alpe Devero | IT | not yet checked | not queried in any run so far |
| Alpe Teglio | IT | not yet checked | not queried in any run so far |
| Alta Badia | IT | not yet checked | not queried in any run so far |
| Antagnod | IT | not yet checked | not queried in any run so far |
| Aprica | IT | not yet checked | not queried in any run so far |
| Arabba | IT | not yet checked | not queried in any run so far |
| Area Sciisitica Febbio - Rescadore | IT | not yet checked | not queried in any run so far |
| Area Sciistica Abetone | IT | not yet checked | not queried in any run so far |
| Area Sciistica Cerreto Laghi | IT | not yet checked | not queried in any run so far |
| Area Sciistica Pratospilla | IT | not yet checked | not queried in any run so far |
| Area Sciistica Schia Monte Caio | IT | not yet checked | not queried in any run so far |
| Area Sciistica Ussita Frontignano | IT | not yet checked | not queried in any run so far |
| Area Scistica Zum Zeri | IT | not yet checked | not queried in any run so far |
| Argentera | IT | not yet checked | not queried in any run so far |
| Artesina | IT | not yet checked | not queried in any run so far |
| Auronzo | IT | not yet checked | not queried in any run so far |
| Bardonecchia | IT | not yet checked | not queried in any run so far |
| Bardonecchia - Jafferau | IT | not yet checked | not queried in any run so far |
| Belvedere - Col Rodella - Passo Pordoi | IT | not yet checked | not queried in any run so far |
| Bielmonte | IT | not yet checked | not queried in any run so far |
| Bolognola | IT | not yet checked | not queried in any run so far |
| Bormio Ski | IT | not yet checked | not queried in any run so far |
| Borno | IT | not yet checked | not queried in any run so far |
| Brentonico | IT | not yet checked | not queried in any run so far |
| Brixen Plose - Plose di Bressanone | IT | not yet checked | not queried in any run so far |
| Brusson | IT | not yet checked | not queried in any run so far |
| Buffaure - Ciampac | IT | not yet checked | not queried in any run so far |
| Campiglio Dolomiti di Brenta | IT | not yet checked | not queried in any run so far |
| Campitello Matese | IT | not yet checked | not queried in any run so far |
| Campo di Giove | IT | not yet checked | not queried in any run so far |
| Campo Felice | IT | not yet checked | not queried in any run so far |
| Campo Imperatore | IT | not yet checked | not queried in any run so far |
| Campo Staffi | IT | not yet checked | not queried in any run so far |
| Campocatino | IT | not yet checked | not queried in any run so far |
| Carezza | IT | not yet checked | not queried in any run so far |
| Chamois | IT | not yet checked | not queried in any run so far |
| Champorcher | IT | not yet checked | not queried in any run so far |
| Cima Piazzi – San Colombano | IT | not yet checked | not queried in any run so far |
| Cimone | IT | not yet checked | not queried in any run so far |
| Cogne | IT | not yet checked | not queried in any run so far |
| Colere | IT | not yet checked | not queried in any run so far |
| Corno alle Scale | IT | not yet checked | not queried in any run so far |
| Cortina d'Ampezzo | IT | not yet checked | not queried in any run so far |
| Cortina Tofane | IT | not yet checked | not queried in any run so far |
| Courmayeur | IT | not yet checked | not queried in any run so far |
| Crévacol | IT | not yet checked | not queried in any run so far |
| Crissolo - Monviso Ski | IT | not yet checked | not queried in any run so far |
| Cristallo - Faloria | IT | not yet checked | not queried in any run so far |
| Doganaccia | IT | not yet checked | not queried in any run so far |
| Domobianca | IT | not yet checked | not queried in any run so far |
| Drei Zinnen - Tre Cime | IT | not yet checked | not queried in any run so far |
| Etna Nord | IT | not yet checked | not queried in any run so far |
| Etna Sud | IT | not yet checked | not queried in any run so far |
| Folgaria | IT | not yet checked | not queried in any run so far |
| Folgarida-Marilleva | IT | not yet checked | not queried in any run so far |
| Foppolo - Carona | IT | not yet checked | not queried in any run so far |
| Foppolo-Carona | IT | not yet checked | not queried in any run so far |
| Forni di Sopra | IT | not yet checked | not queried in any run so far |
| Frabosa Soprana | IT | not yet checked | not queried in any run so far |
| Gambarie | IT | not yet checked | not queried in any run so far |
| Garessio 2000 | IT | not yet checked | not queried in any run so far |
| Gitschberg Jochtal | IT | not yet checked | not queried in any run so far |
| Gressoney-Saint-Jean | IT | not yet checked | not queried in any run so far |
| Jochgrimm | IT | not yet checked | not queried in any run so far |
| Klausberg - Monte Chiusetta | IT | not yet checked | not queried in any run so far |
| Klausberg Skiarena | IT | not yet checked | not queried in any run so far |
| Kronplatz - Plan de Corones | IT | not yet checked | not queried in any run so far |
| La Thuile ski | IT | not yet checked | not queried in any run so far |
| Ladurns | IT | not yet checked | not queried in any run so far |
| Lagazuoi - 5 Torri | IT | not yet checked | not queried in any run so far |
| Lagorai | IT | not yet checked | not queried in any run so far |
| Latemar Dolomites | IT | not yet checked | not queried in any run so far |
| leMelette | IT | not yet checked | not queried in any run so far |
| Livigno | IT | not yet checked | not queried in any run so far |
| Lurisia Monte Pigna | IT | not yet checked | not queried in any run so far |
| Macugnaga - Belvedere | IT | not yet checked | not queried in any run so far |
| Macugnaga - Moro | IT | not yet checked | not queried in any run so far |
| Maniva | IT | not yet checked | not queried in any run so far |
| Marmolada | IT | not yet checked | not queried in any run so far |
| Meran 2000 | IT | not yet checked | not queried in any run so far |
| Monesi di Triora | IT | not yet checked | not queried in any run so far |
| Monte Avena | IT | not yet checked | not queried in any run so far |
| Monte Bondone | IT | not yet checked | not queried in any run so far |
| Monte Catria | IT | not yet checked | not queried in any run so far |
| Monte Pora | IT | not yet checked | not queried in any run so far |
| Montecampione | IT | not yet checked | not queried in any run so far |
| Monterosa Ski | IT | not yet checked | not queried in any run so far |
| Mottarone | IT | not yet checked | not queried in any run so far |
| Nuova Lizzola | IT | not yet checked | not queried in any run so far |
| Ovindoli | IT | not yet checked | not queried in any run so far |
| Paganella | IT | not yet checked | not queried in any run so far |
| Passo Rolle | IT | not yet checked | not queried in any run so far |
| Passo Stelvio - Stilfserjoch | IT | not yet checked | not queried in any run so far |
| Pejo 3000 | IT | not yet checked | not queried in any run so far |
| Pescasseroli | IT | not yet checked | not queried in any run so far |
| Pescegallo | IT | not yet checked | not queried in any run so far |
| Pfelders | IT | not yet checked | not queried in any run so far |
| Pian del Frais | IT | not yet checked | not queried in any run so far |
| Piana di Vigezzo | IT | not yet checked | not queried in any run so far |
| Piancavallo | IT | not yet checked | not queried in any run so far |
| Piani di Bobbio - Valtorta Skiarea | IT | not yet checked | not queried in any run so far |
| Pila ski | IT | not yet checked | not queried in any run so far |
| Pinzolo | IT | not yet checked | not queried in any run so far |
| Ponte di Legno - Passo Tonale | IT | not yet checked | not queried in any run so far |
| Pontechianale | IT | not yet checked | not queried in any run so far |
| Prà Alpesina | IT | not yet checked | not queried in any run so far |
| Prali | IT | not yet checked | not queried in any run so far |
| Prato Nevoso | IT | not yet checked | not queried in any run so far |
| Ratschings-Jaufen | IT | not yet checked | not queried in any run so far |
| Reinswald | IT | not yet checked | not queried in any run so far |
| Riserva Bianca | IT | not yet checked | not queried in any run so far |
| Rittner Horn - Corno del Renon | IT | not yet checked | not queried in any run so far |
| Roccaraso - Rivisondoli | IT | not yet checked | not queried in any run so far |
| Rosskopf | IT | not yet checked | not queried in any run so far |
| Saint Grée di Viola | IT | not yet checked | not queried in any run so far |
| Sampeyre | IT | not yet checked | not queried in any run so far |
| San Martino di Castrozza | IT | not yet checked | not queried in any run so far |
| San Martino di Castrozza - Passo Rolle | IT | not yet checked | not queried in any run so far |
| San Vigilio | IT | not yet checked | not queried in any run so far |
| San Vito di Cadore | IT | not yet checked | not queried in any run so far |
| Sangiacomo Cardini | IT | not yet checked | not queried in any run so far |
| Sansicario | IT | not yet checked | not queried in any run so far |
| Santa Caterina | IT | not yet checked | not queried in any run so far |
| Sappada | IT | not yet checked | not queried in any run so far |
| Sarnano - Sassotetto | IT | not yet checked | not queried in any run so far |
| Sauze D'Oulx | IT | not yet checked | not queried in any run so far |
| Scanno | IT | not yet checked | not queried in any run so far |
| Schnalstal | IT | not yet checked | not queried in any run so far |
| Schöneben - Belpiano | IT | not yet checked | not queried in any run so far |
| Schwemmalm | IT | not yet checked | not queried in any run so far |
| Scopello | IT | not yet checked | not queried in any run so far |
| Seiser Alm - Mont de Sëuc - Alpe di Siusi | IT | not yet checked | not queried in any run so far |
| Sella Nevea - Kanin | IT | not yet checked | not queried in any run so far |
| Sellata - Arioso | IT | not yet checked | not queried in any run so far |
| Sestriere | IT | not yet checked | not queried in any run so far |
| Sirino Sci | IT | not yet checked | not queried in any run so far |
| Ski Area Alpe Lusia | IT | not yet checked | not queried in any run so far |
| Ski Area San Pellegrino - Falcade | IT | not yet checked | not queried in any run so far |
| Ski Center Lavarone | IT | not yet checked | not queried in any run so far |
| Ski Civetta | IT | not yet checked | not queried in any run so far |
| Skiarea San Domenico | IT | not yet checked | not queried in any run so far |
| Skiarea Valchiavenna Madesimo | IT | not yet checked | not queried in any run so far |
| Speikboden | IT | not yet checked | not queried in any run so far |
| Spiazzi di Gromo | IT | not yet checked | not queried in any run so far |
| Sulden | IT | not yet checked | not queried in any run so far |
| Tarvisio | IT | not yet checked | not queried in any run so far |
| Torgnon | IT | not yet checked | not queried in any run so far |
| Trafoi | IT | not yet checked | not queried in any run so far |
| Unnamed ski area (12ab7d68) | IT | not yet checked | not queried in any run so far |
| Unnamed ski area (6a7bce07) | IT | not yet checked | not queried in any run so far |
| Unnamed ski area (da42b4cd) | IT | not yet checked | not queried in any run so far |
| Val Comelico - Padola | IT | not yet checked | not queried in any run so far |
| Val d'Aveto | IT | not yet checked | not queried in any run so far |
| Val di Fassa | IT | not yet checked | not queried in any run so far |
| Valle Fura | IT | not yet checked | not queried in any run so far |
| Valmalenco Bernina | IT | not yet checked | not queried in any run so far |
| Valtournenche | IT | not yet checked | not queried in any run so far |
| Verena 2000 | IT | not yet checked | not queried in any run so far |
| Vigo di Fassa - Ciampedie | IT | not yet checked | not queried in any run so far |
| Villaggio Palumbo | IT | not yet checked | not queried in any run so far |
| Watles - Vatles | IT | not yet checked | not queried in any run so far |
| Zoncolan | IT | not yet checked | not queried in any run so far |
| Malbun | LI | not yet checked | not queried in any run so far |
| Kolašin 1450 ski resort | ME | not yet checked | not queried in any run so far |
| Mavrovo | MK | not yet checked | not queried in any run so far |
| Ski Center Brezovica | MK | not yet checked | not queried in any run so far |
| Скијачки центар Попова шапка | MK | not yet checked | not queried in any run so far |
| Ådneram Skitrekk | NO | not yet checked | not queried in any run so far |
| Ål skisenter | NO | not yet checked | not queried in any run so far |
| Beitostølen Skisenter | NO | not yet checked | not queried in any run so far |
| Bjorli Skisenter | NO | not yet checked | not queried in any run so far |
| Eikedalen skisenter | NO | not yet checked | not queried in any run so far |
| Gålå Alpinsenter | NO | not yet checked | not queried in any run so far |
| Gausta skisenter | NO | not yet checked | not queried in any run so far |
| Gautefall skisenter | NO | not yet checked | not queried in any run so far |
| Geilo | NO | not yet checked | not queried in any run so far |
| Grong skisenter | NO | not yet checked | not queried in any run so far |
| Hafjell | NO | not yet checked | not queried in any run so far |
| Hallingskarvet skisenter | NO | not yet checked | not queried in any run so far |
| Harpefossen skisenter | NO | not yet checked | not queried in any run so far |
| Hemsedal | NO | not yet checked | not queried in any run so far |
| Hemsedal skisenter | NO | not yet checked | not queried in any run so far |
| Hovden Alpinsenter | NO | not yet checked | not queried in any run so far |
| Jølster Skisenter | NO | not yet checked | not queried in any run so far |
| Kongsberg | NO | not yet checked | not queried in any run so far |
| Kvitfjell | NO | not yet checked | not queried in any run so far |
| Meråker alpinsenter | NO | not yet checked | not queried in any run so far |
| Myrkdalen | NO | not yet checked | not queried in any run so far |
| Narvikfjellet Ski Resort | NO | not yet checked | not queried in any run so far |
| Nesfjellet Alpinsenter | NO | not yet checked | not queried in any run so far |
| Norefjell | NO | not yet checked | not queried in any run so far |
| Norefjell | NO | not yet checked | not queried in any run so far |
| Oppdal Skisenter | NO | not yet checked | not queried in any run so far |
| Ørsta skisenter | NO | not yet checked | not queried in any run so far |
| Rauland skisenter | NO | not yet checked | not queried in any run so far |
| Riksgränsen | NO | not yet checked | not queried in any run so far |
| Røldal Skisenter | NO | not yet checked | not queried in any run so far |
| Røros Alpinsenter Hummelfjell | NO | not yet checked | not queried in any run so far |
| Sauda skisenter | NO | not yet checked | not queried in any run so far |
| Sirdal Skisenter | NO | not yet checked | not queried in any run so far |
| Skeikampen Alpinsenter | NO | not yet checked | not queried in any run so far |
| Ski Geilo | NO | not yet checked | not queried in any run so far |
| Skimore Oslo | NO | not yet checked | not queried in any run so far |
| Sogn skisenter | NO | not yet checked | not queried in any run so far |
| Sogndal skisenter | NO | not yet checked | not queried in any run so far |
| Storefjell Resort | NO | not yet checked | not queried in any run so far |
| Strandafjellet skisenter | NO | not yet checked | not queried in any run so far |
| Stryn Vinterski | NO | not yet checked | not queried in any run so far |
| Sunnmørsalpane Skiarena Fjellseter | NO | not yet checked | not queried in any run so far |
| Tromsø Alpinpark | NO | not yet checked | not queried in any run so far |
| Trysil | NO | not yet checked | not queried in any run so far |
| Tyin-Filefjell | NO | not yet checked | not queried in any run so far |
| Unnamed ski area (04d3cb20) | NO | not yet checked | not queried in any run so far |
| Uvdal alpinsenter (Senteret) | NO | not yet checked | not queried in any run so far |
| Valdres Alpinsenter | NO | not yet checked | not queried in any run so far |
| Vassfjellet skisenter | NO | not yet checked | not queried in any run so far |
| Vierli | NO | not yet checked | not queried in any run so far |
| Volda skisenter | NO | not yet checked | not queried in any run so far |
| Voss Resort Fjellheisar | NO | not yet checked | not queried in any run so far |
| Vrådal Panorama | NO | not yet checked | not queried in any run so far |
| COS Szczyrk | PL | not yet checked | not queried in any run so far |
| Czarna Góra | PL | not yet checked | not queried in any run so far |
| Deštné v Orlických horách | PL | not yet checked | not queried in any run so far |
| Dwie Doliny Muszyna-Wierchomla | PL | not yet checked | not queried in any run so far |
| Jaworzyna Krynicka | PL | not yet checked | not queried in any run so far |
| Kasprowy Wierch | PL | not yet checked | not queried in any run so far |
| Kompleks narciarski Winterpol w Karpaczu | PL | not yet checked | not queried in any run so far |
| Kompleks Pilsko-Jontek | PL | not yet checked | not queried in any run so far |
| Master Ski | PL | not yet checked | not queried in any run so far |
| Master-Ski | PL | not yet checked | not queried in any run so far |
| Ośrodek Narciarski Kotelnica Białczańska | PL | not yet checked | not queried in any run so far |
| Słotwiny Arena | PL | not yet checked | not queried in any run so far |
| Stacja Narciarska Cieńków | PL | not yet checked | not queried in any run so far |
| Stacja Narciarska Kotelnica Białczańska | PL | not yet checked | not queried in any run so far |
| Szczyrk Mountain Resort | PL | not yet checked | not queried in any run so far |
| Szrenica Ski Arena | PL | not yet checked | not queried in any run so far |
| Zieleniec | PL | not yet checked | not queried in any run so far |
| Azuga | RO | not yet checked | not queried in any run so far |
| Clăbucet | RO | not yet checked | not queried in any run so far |
| Muntele Mic | RO | not yet checked | not queried in any run so far |
| Parâng | RO | not yet checked | not queried in any run so far |
| Poiana Brașov | RO | not yet checked | not queried in any run so far |
| Semenic | RO | not yet checked | not queried in any run so far |
| Sinaia | RO | not yet checked | not queried in any run so far |
| Ski Vidra | RO | not yet checked | not queried in any run so far |
| Straja | RO | not yet checked | not queried in any run so far |
| Șureanu | RO | not yet checked | not queried in any run so far |
| Kopaonik | RS | not yet checked | not queried in any run so far |
| Ski Center Kopaonik | RS | not yet checked | not queried in any run so far |
| Ski Center Stara planina | RS | not yet checked | not queried in any run so far |
| Tornik | RS | not yet checked | not queried in any run so far |
| Åre | SE | not yet checked | not queried in any run so far |
| Björkliden | SE | not yet checked | not queried in any run so far |
| Björnrike | SE | not yet checked | not queried in any run so far |
| Borgafjällbackarna | SE | not yet checked | not queried in any run so far |
| Branäs | SE | not yet checked | not queried in any run so far |
| Bydalsfjällen | SE | not yet checked | not queried in any run so far |
| Dundret | SE | not yet checked | not queried in any run so far |
| Edsåsdalen | SE | not yet checked | not queried in any run so far |
| Funäsdalen | SE | not yet checked | not queried in any run so far |
| Hemavan | SE | not yet checked | not queried in any run so far |
| Högfjället | SE | not yet checked | not queried in any run so far |
| Hovfjället | SE | not yet checked | not queried in any run so far |
| Hundfjället | SE | not yet checked | not queried in any run so far |
| Idre Fjäll | SE | not yet checked | not queried in any run so far |
| Idre Himmelfjäll | SE | not yet checked | not queried in any run so far |
| Järvsöbacken | SE | not yet checked | not queried in any run so far |
| Kittelfjäll | SE | not yet checked | not queried in any run so far |
| Kläppen | SE | not yet checked | not queried in any run so far |
| Klimpfjällsbackarna | SE | not yet checked | not queried in any run so far |
| Klövsjö | SE | not yet checked | not queried in any run so far |
| Kungsberget | SE | not yet checked | not queried in any run so far |
| Lindvallen | SE | not yet checked | not queried in any run so far |
| Lofsdalen | SE | not yet checked | not queried in any run so far |
| Ramundberget | SE | not yet checked | not queried in any run so far |
| Romme Alpin | SE | not yet checked | not queried in any run so far |
| Säfsen | SE | not yet checked | not queried in any run so far |
| Sälen | SE | not yet checked | not queried in any run so far |
| Ski Sunne | SE | not yet checked | not queried in any run so far |
| Stöten i Sälen | SE | not yet checked | not queried in any run so far |
| Svanstein | SE | not yet checked | not queried in any run so far |
| Tandådalen | SE | not yet checked | not queried in any run so far |
| Tänndalen | SE | not yet checked | not queried in any run so far |
| Tärmaby | SE | not yet checked | not queried in any run so far |
| Trillevallen | SE | not yet checked | not queried in any run so far |
| Unnamed ski area (eeed3ddc) | SE | not yet checked | not queried in any run so far |
| Valfjället Skicenter | SE | not yet checked | not queried in any run so far |
| Vemdalsskalet | SE | not yet checked | not queried in any run so far |
| Cerkno | SI | not yet checked | not queried in any run so far |
| Gače | SI | not yet checked | not queried in any run so far |
| Golte | SI | not yet checked | not queried in any run so far |
| Kope | SI | not yet checked | not queried in any run so far |
| Kranjska Gora | SI | not yet checked | not queried in any run so far |
| Krvavec | SI | not yet checked | not queried in any run so far |
| Rogla | SI | not yet checked | not queried in any run so far |
| Smučišča Mariborsko Pohorje | SI | not yet checked | not queried in any run so far |
| Soriška planina | SI | not yet checked | not queried in any run so far |
| Stari Vrh | SI | not yet checked | not queried in any run so far |
| Vogel | SI | not yet checked | not queried in any run so far |
| Bachledova dolina | SK | not yet checked | not queried in any run so far |
| Chopok Jasná | SK | not yet checked | not queried in any run so far |
| Chopok Juh | SK | not yet checked | not queried in any run so far |
| Donovaly | SK | not yet checked | not queried in any run so far |
| Jasna Low Tatras | SK | not yet checked | not queried in any run so far |
| Kohútka | SK | not yet checked | not queried in any run so far |
| Kubínská hola | SK | not yet checked | not queried in any run so far |
| Malinô Brdo | SK | not yet checked | not queried in any run so far |
| Martinské hole | SK | not yet checked | not queried in any run so far |
| Martinské Hole | SK | not yet checked | not queried in any run so far |
| Orava Snow | SK | not yet checked | not queried in any run so far |
| Šachtičky | SK | not yet checked | not queried in any run so far |
| Ski Lysá | SK | not yet checked | not queried in any run so far |
| Štrbské Pleso | SK | not yet checked | not queried in any run so far |
| Veľká Rača | SK | not yet checked | not queried in any run so far |
| Vrátna | SK | not yet checked | not queried in any run so far |
| Vysoké Tatry - Tatranská Lomnica | SK | not yet checked | not queried in any run so far |
| Davraz Dağı | TR | not yet checked | not queried in any run so far |
| Denizli Kayak Merkezi | TR | not yet checked | not queried in any run so far |
| Ergan Dağı Kış Sporları Turizm Merkezi | TR | not yet checked | not queried in any run so far |
| Kartepe | TR | not yet checked | not queried in any run so far |
| Kayseri-Erciyes | TR | not yet checked | not queried in any run so far |
| Konaklı Kayak Merkezi | TR | not yet checked | not queried in any run so far |
| Palandöken Kayak Merkezi | TR | not yet checked | not queried in any run so far |
| Sarıkamış Cıbıltepe | TR | not yet checked | not queried in any run so far |
| Uludağ Kayak Merkezi | TR | not yet checked | not queried in any run so far |
| Bukowina | UA | not yet checked | not queried in any run so far |
| Drahobrat | UA | not yet checked | not queried in any run so far |
| Krasiya - КРАСИЯ | UA | not yet checked | not queried in any run so far |
| Slavske - Trostyan | UA | not yet checked | not queried in any run so far |
| Slavske - Zahar Berkut | UA | not yet checked | not queried in any run so far |
| Гірськолижний комплекс "Плай" | UA | not yet checked | not queried in any run so far |

---

Prices, currencies and dates are facts (PLAN.md §9) and are the only thing ingested here. No marketing copy, description or image is copied, no login or paywall is bypassed, and the operator's own site is preferred over aggregators. Discovery is machine-assisted and every row awaits human verification.

---

## Manual research batch — 2026-08-10

17 rows added by hand-run web research (Claude session, owner-requested):
Bulgaria (Bansko, Pamporovo), Georgia (Gudauri, Bakuriani×2 areas, Mestia×2
areas, Goderdzi — day tickets + the unified 650 GEL MRG season pass on all
six), Andorra (Grandvalira, Pal-Arinsal, Ordino-Arcalís — all dynamic,
recorded as floors). All `verification: 'unverified'`.

For a human verifier, the sharp edges:

- **Bansko BGN 65/day** is the season-opening promotional rate from the
  operator's news page; the regular 2024/25 high-season day pass was BGN 110.
  Recorded as dynamic/floor. Check banskoski.com/en/page/prices once the
  full 2025/26 table is published.
- **Vitosha: deliberately absent.** No published 2025/26 price found on any
  source worth citing. Absence is the correct state.
- **Borovets 6-day**: the only figure found (BGN 300, SNO) looks like stale
  data and was NOT stored.
- **Andorra floors** come from aggregator-observed ranges (SnowStash);
  official pages are dynamic shops with no flat price to quote.
- Bulgaria adopts the euro on 2026-01-01: BGN figures are as published and
  will be dual-priced or restated mid-season.
