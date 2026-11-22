# Klinische Fragen

`updates/questions/` bietet eine Übersicht und einzelne Themenseiten mit Kurzantwort,
Studienvergleich, methodischer Einordnung, offenen Fragen und Änderungsverlauf.
Der Pilot `?frage=axi-cel-vs-liso-cel-zweitlinie` betrifft die Produktwahl beim LBCL
in der Zweitlinie. Auf Mobilgeräten werden die Tabellenzeilen als Studienkarten angezeigt.

Die kuratierten Inhalte und Quellenzuordnungen liegen versioniert in
`updates/questions/data.json`. Jede Studie besitzt eine Studienfamilie und kann
mehrere Archiv-IDs referenzieren. Unterschiedliche Fassungen derselben Studie
bleiben kenntlich. Eine zusätzliche Kategorie „Klinische Fragen“ enthält einen
vollständigen, durchsuchbaren Textstand in `ua_entries`, einschließlich der
bestehenden Funktionen für Prioritäten, öffentliche Notizen und Kommentare.
`updates/?entry=<URL-kodierte ID>` öffnet eine Meldung direkt. Die Detailansicht
zugeordneter Quellen verlinkt zurück auf die klinische Einordnung.

Schemaergänzung `supabase/update-archive-clinical-questions.sql` erweitert nur die
Kategorienprüfung. Zugriff und bestehende API bleiben unverändert. Redaktionelle
Fragen werden aus der Quelldatei gepflegt und nicht über den Wochenbericht-Import.
`node updates/questions/sync.mjs` erzeugt den SQL-Import für den Textstand.
Der Import erhält Notizen, Prioritäten und Kommentare, erhöht die Version nur
bei Inhaltsänderungen und verhindert Rückschritte auf ein älteres Kurationsdatum.
Das Löschen des Archiveintrags entfernt dessen Kommentare und Notizen. Die
separat veröffentlichte Themenseite bleibt dabei bestehen, wie die Bestätigung angibt.

Bei einer Aktualisierung zunächst neue Primärquellen, Datenreife, Therapielinie,
Nenner und Überschneidungen prüfen. Alle Zahlen gegen die jeweilige Quellenversion
prüfen und die HR-Richtung angeben. Danach `data.json` samt Prüfdatum und
Änderungsverlauf aktualisieren, veröffentlichen, den erzeugten SQL-Import ausführen
und Seite sowie öffentlichen API-Eintrag prüfen. Die offenen Fragen benennen
konkrete Daten, die eine erneute Bewertung auslösen sollen. Der Pilot richtet
keinen zusätzlichen Zeitplan ein.

