# Update-Archiv

Fünftes Werkzeug unter `updates/`. HTML/CSS/JS ohne Build-Schritt. Die Edge Function `update-archive-api` speichert Daten in den `ua_*`-Tabellen. Die Oberfläche enthält keine Berichte, Passwörter oder privaten Schlüssel.

## Zugriff

Das Archiv ist öffentlich lesbar, einschließlich vorhandener Notizen, Kommentare und vollständiger Berichte. Gäste können neue Kommentare mit einem Pflichtfeld „Autor“ hinterlassen. Nur der Admin kann Prioritäten und Notizen ändern, Berichte importieren sowie Kommentare bearbeiten oder löschen. Die Anmeldung verwendet das bisherige Passwort. Passwortprüfung: PBKDF2-SHA256 mit zufälligem Salt und 100.000 Iterationen; ausschließlich der Hash liegt in `ua_settings`. Tokens sind zufällige 256-Bit-Werte, serverseitig nur als SHA-256 gespeichert, widerrufbar und nach einem Tag bzw. bei „angemeldet bleiben“ nach 30 Tagen abgelaufen. Die Login-Rate ist auf 20 Versuche je IP/10-Minuten-Fenster begrenzt.

Die Gateway-JWT-Prüfung ist ausgeschaltet. `list`, `visit` und `comment-add` sind ausdrücklich öffentlich; alle Verwaltungsaktionen verlangen eine gültige Admin-Sitzung. `list` liefert ausschließlich definierte Inhaltsfelder und `is_admin`, keine Einstellungen oder Sitzungen. Gäste können den Autorennamen „Admin“ nicht verwenden. Das Kennzeichen `author_is_admin` wird ausschließlich anhand der serverseitig geprüften Sitzung gesetzt. Gastkommentare sind auf 20 je IP/10-Minuten-Fenster begrenzt. Alteinträge bleiben mit „Ohne Autorenangabe (Altbestand)“ erhalten; eine unbekannte Autorschaft wird nicht nachträglich zugeschrieben.

Die Funktion verwendet serverseitig `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`. Alle Tabellen haben RLS; `anon` und `authenticated` haben keine Tabellen- oder RPC-Rechte. Nur `service_role` hat Zugriff. Service-Role-Zugang und Passwort-Hash werden nie an den Browser zurückgegeben.

## Daten und Import

Vollständige Wochenberichte bleiben in `ua_reports`. Meldungen in `ua_entries` verweisen über `ua_report_entries` auf einen oder mehrere Berichte. Die browserseitige Volltextsuche umfasst Titel, Text, Tags, Quellenlink, Notiz, Kommentare und Autorennamen. Alle Datensätze werden paginiert geladen; der Suchindex existiert nur im Arbeitsspeicher. Kalenderfilter und chronologische Sortierung beziehen sich auf das Datum des ersten importierten Berichts, nicht auf das Publikationsdatum. „Von“ und „Bis“ bilden auch auf schmalen iPhones eine gemeinsame Zeile; die nativen Datumsfelder dürfen ihre Grid-Spalten nicht verbreitern.

Beim Textimport werden Abschnitte vorgeschlagen, die vor dem Speichern geprüft und bearbeitet werden. PMID, DOI oder spezifischer Quellenlink dienen zur Deduplizierung; ansonsten Titel und Text. Wiederholte Imports überschreiben keine bestehenden Texte oder persönlichen Ergänzungen. Neue vollständige Berichte bleiben über die Verknüpfung verfügbar. Allgemeine FDA-/EMA-URLs werden nicht als eindeutige Identität genutzt. Es gibt keinen automatischen Abruf von ChatGPT-Berichten.

Priorität (0–3) hat bei der Interessensortierung Vorrang. Innerhalb einer Stufe: `3 × Kommentaranzahl + min(Aufruftage, 20)`, anschließend Berichtsdatum absteigend. Öffnen zählt höchstens einmal pro Kalendertag (Europe/Berlin), gemeinsam über alle Geräte. Notizen und Kommentare sind bearbeitbar, Kommentare auch löschbar. Versionsprüfungen verhindern unbemerktes Überschreiben paralleler Änderungen. Bei einem Versionskonflikt den Entwurf kopieren und die Ansicht neu laden.

## Betrieb und Tests

Als Admin kannst du eine einzelne Meldung auf ihrer Karte oder in der Detailansicht mit „Meldung löschen“ entfernen. Die Bestätigung zeigt den Titel. Der RPC `ua_delete_entry` prüft die angezeigte Version und löscht die Meldung mit Notiz, Kommentaren, Aufruftagen und Berichtsverknüpfungen in einer Transaktion. Die vollständigen Wochenberichte bleiben lesbar. Ein späterer Import kann dieselbe Meldung erneut anlegen. GitHub enthält den Anwendungscode, die Archivmeldungen liegen in Supabase. Schemaergänzung für bestehende Installationen: `supabase/update-archive-delete-entry.sql`.

Schema: `supabase/update-archive-schema.sql`, angewandte Migration `create_update_archive`. Erweiterung: `supabase/update-archive-public.sql` (`open_update_archive_with_authors`). Function: `supabase/functions/update-archive-api/index.js`. Bestehende Dienstplan-Daten und -Funktionen werden nicht verändert. Der Service Worker speichert nur gleich-originige öffentliche Dateien, keine externen APIs oder privaten Inhalte.

Tests: `node --test updates/core.test.mjs supabase/functions/update-archive-api/auth.test.mjs`. Keine Produktionspasswörter oder Daten in Testdateien. Passwortwechsel: neuen Salt/Hash in `ua_settings` setzen und Archiv-Sitzungen löschen.

## Zotero

„Zu Zotero hinzufügen“ ist in Karten und Detailansicht verfügbar. Die Quellenauswahl enthält den Originalquellenlink und HTTP(S)-Links aus dem Meldungstext. Ohne Quelle bleibt der Button deaktiviert. Der ausgewählte Link wird URL-kodiert an `https://www.zotero.org/save?q=…` übergeben; die Anmeldung und Speicherung erfolgen bei Zotero. Kein API-Key und keine lokale Desktop-Verbindung erforderlich. Notizen, Kommentare und der Meldungstext werden nicht übertragen. Der Browser öffnet die Save-Seite über einen Button, damit der Connector nicht einen Save-Anker abfängt und versehentlich die Archivseite speichert.

Auf Geräten mit Web Share API steht zusätzlich „Teilen …“ für die Zotero-App zur Verfügung. Die App behauptet keinen erfolgreichen Import: Den bestätigt nur Zotero. PDFs und vollständige Metadaten hängen von der Quelle ab; dafür empfiehlt sich der Connector auf der Originalseite. Quellen ohne bibliografische Metadaten können als Webseite gespeichert werden.


## ASH-2026-Prioritäten

Im eigenständigen Archiv `ash-2026/` kann der Admin jeden Beitrag direkt auf `+`, `++` oder `+++` setzen und mit `–` wieder entfernen. Anmeldung über „Prioritäten bearbeiten“ mit dem bestehenden Archiv-Passwort; die Prioritäten sind öffentlich lesbar und geräteübergreifend gespeichert. Filter: alle, nur priorisierte, einzelne Stufen oder ohne Priorität. Die optionale Sortierung stellt `+++` vor `++` vor `+` vor unpriorisierte Beiträge; bei Gleichstand gilt die Abstractnummer. Die Standardsortierung bleibt die Abstractnummer.

Schemaergänzung: `supabase/ash2026-priority.sql`, angewandte Migration `add_ash2026_priorities`. `priority` (0–3, Standard 0) und `priority_version` ergänzen `ash2026_abstracts`. Der RPC `ash2026_set_priority` nutzt wie `ash2026_add` einen SECURITY-INVOKER-Wrapper und eine Funktion im nicht exponierten Schema `ash2026_private`. Diese prüft den Hash und Ablauf der bestehenden Admin-Sitzung, die erlaubten Werte und die erwartete Version. Direkte Schreibrechte für Gäste bleiben gesperrt. Neue/importierte Abstracts benötigen keine Priorität; bestehende Bewertungen werden durch reine Inhaltsaktualisierungen nicht überschrieben.

Die Oberfläche bestätigt Änderungen erst nach erfolgreicher Serverantwort. Bei einem Versionskonflikt lädt sie den aktuellen Stand und fordert eine erneute Auswahl; bei abgelaufener Anmeldung wird die Bearbeitung beendet. Datenbankprüfung mit Transaktions-Rollback: anonyme und abgelaufene Tokens abgewiesen, direkte Gast-Schreibzugriffe gesperrt, alle vier Stufen gespeichert, veraltete Versionen und ungültige Werte abgewiesen.

## ASH-2026-Sammlung „Moderne CAR T konstrukte“

Die manuelle Sammlung wird zusätzlich zu den Erkrankungen und Methoden eines Abstracts gepflegt. Öffentlich zeigt ein Badge die Mitgliedschaft an. Im bestehenden Filter „Kategorie / Methode“ steht unter „Manuelle Sammlungen“ die Auswahl „Moderne CAR T konstrukte“ bereit; sie lässt sich mit Erkrankung, Freitextsuche und Priorität kombinieren. „Zurücksetzen“ stellt die Gesamtansicht wieder her.

Nach der Anmeldung über „Zuordnung & Prioritäten“ lässt sich die Sammlung mit dem Ein/Aus-Schalter direkt an jeder Karte ändern. Beim Anlegen eines Beitrags ist dieselbe Zuordnung als Checkbox verfügbar. Der Schalter speichert die Mitgliedschaft für alle Geräte, während die Auswahl im Kategorie-Filter nur die eigene Ansicht einschränkt.

Schema: `supabase/ash2026-collections.sql`, angewandte Migration `20261118053542_ash2026_manual_car_t_collection`. `collections` enthält den erlaubten Slug `moderne-car-t-konstrukte`; `collections_version` verhindert unbemerktes Überschreiben gleichzeitiger Zuordnungsänderungen. Der RPC `ash2026_set_collection` verwendet wie die Prioritäten die vorhandene serverseitig geprüfte Archiv-Admin-Sitzung, einen SECURITY-INVOKER-Wrapper und eine private SECURITY-DEFINER-Funktion mit festem Suchpfad. Direkte Gast-Schreibrechte bleiben gesperrt. Prioritäten und ihre Versionsnummer sind unabhängig von der Sammlung.

Der initiale Import vom 18.11.2026 ist unter `ash-2026/content/moderne-car-t-konstrukte-2026-11-18.json` versioniert. Er umfasst 13 neue Abstracts mit individuell zugeordneten ASH-Direktlinks und kurzen deutschen Einordnungen. Zusätzlich wurden die bereits vorhandenen Beiträge #706, #1027, #1028, #1032 und #1922 der Sammlung zugeordnet, ohne deren Texte oder Prioritäten zu ändern. Supabase bleibt die maßgebliche Quelle für spätere manuelle Änderungen; die JSON-Datei ist ein Import-Snapshot und wird vom Browser nicht als zweite Datenquelle geladen.

Noch offene Linkzuordnungen wurden nicht importiert: #1051 (QI-019A), #1056 (TmCD19-IL18), #4169 (LB2501) und #4181 (19-28z/IL18). Für #118 und #1029 wurden die bisher offenen Zuordnungen anhand der offiziellen Einzelabstractseiten bestätigt. Alle importierten Quellen nutzen `paper-details.aspx?pid=…`; Sessionlinks werden nicht als Abstractquellen verwendet. Ein Teil der Inhalte wurde über den offiziellen ASH-Suchindex verifiziert, da die Einzelseiten beim Live-Abruf zeitweise leere Abstractfelder liefern.

Prüfung: `supabase/ash2026-collections.test.sql` testet innerhalb einer zurückgerollten Transaktion das Ein-/Ausschalten, Versionskonflikte, unerlaubte Slugs und das Anlegen mit Sammlungszuordnung. Fehlende/ungültige Sitzungen sowie direkte Gast-Schreibzugriffe wurden separat geprüft. Es verbleiben keine Testbeiträge oder Testsitzungen.


