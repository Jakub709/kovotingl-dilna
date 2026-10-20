# Obrábění a orientační výpočty – verze 0.5.0

## Otvory a výřezy
Vyber jeden 3D jekl s vyřešenými konci a použij **Otvor / výřez do jeklu**. Kruhové vrtání nebo obdélníkový výřez odečítají skutečný materiál. Lze obrábět jednu stěnu do zadané hloubky nebo projít oběma stěnami. Výřez lze natočit v rovině stěny a přesáhnout přes konec pro zářez. Nejvýše 12 operací na profil. Nejde zatím o libovolné prostorové frézování, řez jiným dílem ani řez z nakresleného mnohoúhelníku.

Podélná souřadnice je od počátečního bodu osy, nikoli od hrany seříznutého polotovaru. Příčná souřadnice na stěně U směřuje do +V, na stěně V do −U. Hloubka je od vnějšího povrchu dovnitř. Změna délky nepřepočítá polohu obrábění poměrem; zůstává ve stejné vzdálenosti od začátku. Kopie i otočení zachovají obrábění. Odstranění a Zpět jsou dostupné. Výrobní detail uvádí rozměry a polohy; kruhové otvory jsou ve 3D aproximovány 64 úseky. Úplné rozdělení profilu výřezem nezmění automaticky počet dílů v kusovníku.

Neplatné obrábění blokuje výrobní výstupy. Nářez stále připravuje původní polotovar před obráběním. Výpočet koncového spoje ověřuje opěrnou plochu jeklu před jeho obráběním; zkontroluj, zda výřez nezasahuje do styčné plochy svaru.

## Kolize
Po rychlé kontrole obálek se počítá průnik objemů skutečného materiálu včetně dutin, vrtání a otvorů v patkách. Vnější překrytí do 0,2 mm se ignoruje; objem průniku musí přesáhnout 0,01 mm³. Jde o numerickou kontrolu ploškového modelu, nikoli přesné analytické plochy. Nejvýše 100 podrobných kontrol dvojic; při limitu nebo nevyřešené geometrii se zobrazí upozornění na částečnou kontrolu a použijí obálky. Žádné varování není důkazem úplné vyrobitelnosti.

## STEP
**Export STEP · ploškový model** zapisuje AP214 povrchový model v milimetrech. Stejná geometrie je v náhledu, OBJ i STEP. STEP má rovinné trojúhelníkové plochy, není analytickým objemovým BREP s válcovými otvory nebo historií operací. Je určený k přenosu a prohlížení tvaru; pro další parametrické úpravy a CAM záleží na možnostech cílového CAD. Export se ověřuje nezávislým OpenCascade importérem.

## Orientační nosník
Jeden prostě podepřený neoslabený obdélníkový nebo čtvercový jekl, rovnoměrné zatížení po celém rozpětí a bodová síla uprostřed. Rozpětí odpovídá délce osy vybraného dílu. Výška průřezu je směr místní osy V, nezávisle na natočení dílu v modelu. Nelze použít pro profil s obráběním. Výchozí E = 210 000 MPa a fy = 235 MPa jsou editovatelné. Vlastní tíha se nepřidává automaticky.

Použité vztahy (N, mm, MPa): I = [b h³ − (b−2t)(h−2t)³]/12; W = 2I/h; M = qL²/8 + FL/4; σ = M/W; δ = 5qL⁴/(384EI) + FL³/(48EI). 1 kN/m = 1 N/mm. Porovnává se s uživatelem zadaným fy a limitem L/n. Průřez je idealizován ostrými rohy.

Výstup není normové posouzení: bez zatěžovacích kombinací, stability, vzpěru, klopení, lokálního boulení, smyku, deformací spojů a kotvení. Je to výpočet jednoho nosníku, nikoli statika pergoly.

Zdroj vztahů: [BCSA – Steel Buildings, tabulky průhybů a ohybových momentů](https://www.steelconstruction.info/images/0/03/BCSA_35-03.pdf).

## Orientační koutový svar
Zadej přímou návrhovou sílu bez momentu a excentricity, účinné hrdlo a a celkovou účinnou délku l. Účinnou délku stanoví uživatel po odečtení neúčinných konců. Výchozí fu = 360 MPa, βw = 0,8 a γM2 = 1,25 je nutné ověřit pro skutečný materiál a použitelná pravidla.

Použité vztahy: fvw = fu/(√3 βw γM2); F_Rd = a l fvw; a_potřebné = F/(l fvw). Požaduje se l ≥ max(30 mm, 6a). Zobrazené potřebné hrdlo vychází pouze ze síly: nezohledňuje minimální technologické hrdlo, tloušťku stěny, rozdělení délky do jednotlivých svarů a další konstrukční pravidla. Nejde o automatický návrh spoje. Neověřuje základní materiál, únavu ani stěnu jeklu.

Zdroj: [ArcelorMittal – Applications of fillet weld calculation](https://constructalia.arcelormittal.com/en/sica-steel-academy/design-with-steel/connection-design-static-loads/welded-connections-applications-of-fillet-weld-calculation).

Vstupy výpočtů se ukládají s dílem. Detail řezů a PDF obsahují výsledky a předpoklady. Výpočet nosníku se přepočítá z aktuálních rozměrů; po obrábění je označen za nepoužitelný. Výpočty samy neurčují schválení výroby. Projekty této verze používají formát 5, starší aplikace je neotevře.
