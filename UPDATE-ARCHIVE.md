# Update-Archiv

Fünftes Werkzeug unter `updates/`. HTML/CSS/JS ohne Build-Schritt. Die Edge Function `update-archive-api` speichert Daten in den `ua_*`-Tabellen. Die Oberfläche enthält keine Berichte, Passwörter oder privaten Schlüssel.

## Zugriff

Ein gemeinsames Archiv hinter einer Passwort-Anmeldung, keine getrennten Benutzerkonten. Wer das Passwort kennt, kann Notizen, Kommentare, Prioritäten und Berichte bearbeiten. Passwortprüfung: PBKDF2-SHA256 mit zufälligem Salt und 100.000 Iterationen; ausschließlich der Hash liegt in `ua_settings`. Tokens sind zufällige 256-Bit-Werte, serverseitig nur als SHA-256 gespeichert, widerrufbar und nach einem Tag bzw. bei „angemeldet bleiben“ nach 30 Tagen abgelaufen. Die Login-Rate ist auf 20 Versuche je IP/10-Minuten-Fenster begrenzt.

Die Gateway-JWT-Prüfung ist für diese Funktion ausgeschaltet, da jede Aktion außer Login ihre eigene gültige Archiv-Sitzung verlangt. Die Funktion verwendet serverseitig `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`. Alle Tabellen haben RLS; `anon` und `authenticated` haben keine Tabellen- oder RPC-Rechte. Nur `service_role` hat Zugriff. Service-Role-Zugang und Passwort-Hash werden nie an den Browser zurückgegeben.

## Daten und Import

Vollständige Wochenberichte bleiben in `ua_reports`. Meldungen in `ua_entries` verweisen über `ua_report_entries` auf einen oder mehrere Berichte. Die browserseitige Volltextsuche umfasst Titel, Text, Tags, Quellenlink, Notiz und Kommentare. Alle Datensätze werden paginiert geladen; der Suchindex existiert nur im Arbeitsspeicher. Kalenderfilter und chronologische Sortierung beziehen sich auf das Datum des ersten importierten Berichts, nicht auf das Publikationsdatum.

Beim Textimport werden Abschnitte vorgeschlagen, die vor dem Speichern geprüft und bearbeitet werden. PMID, DOI oder spezifischer Quellenlink dienen zur Deduplizierung; ansonsten Titel und Text. Wiederholte Imports überschreiben keine bestehenden Texte oder persönlichen Ergänzungen. Neue vollständige Berichte bleiben über die Verknüpfung verfügbar. Allgemeine FDA-/EMA-URLs werden nicht als eindeutige Identität genutzt. Es gibt keinen automatischen Abruf von ChatGPT-Berichten.

Priorität (0–3) hat bei der Interessensortierung Vorrang. Innerhalb einer Stufe: `3 × Kommentaranzahl + min(Aufruftage, 20)`, anschließend Berichtsdatum absteigend. Öffnen zählt höchstens einmal pro Kalendertag (Europe/Berlin), gemeinsam über alle Geräte. Notizen und Kommentare sind bearbeitbar, Kommentare auch löschbar. Versionsprüfungen verhindern unbemerktes Überschreiben paralleler Änderungen. Bei einem Versionskonflikt den Entwurf kopieren und die Ansicht neu laden.

## Betrieb und Tests

Schema: `supabase/update-archive-schema.sql`, angewandte Migration `create_update_archive`. Function: `supabase/functions/update-archive-api/index.js`. Bestehende Dienstplan-Daten und -Funktionen werden nicht verändert. Der Service Worker speichert nur gleich-originige öffentliche Dateien, keine externen APIs oder privaten Inhalte.

Tests: `node --test updates/core.test.mjs supabase/functions/update-archive-api/auth.test.mjs`. Keine Produktionspasswörter oder Daten in Testdateien. Passwortwechsel: neuen Salt/Hash in `ua_settings` setzen und Archiv-Sitzungen löschen.
