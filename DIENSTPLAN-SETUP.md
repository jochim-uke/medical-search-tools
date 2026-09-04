# Dienstplan-Viewer: Supabase-Einrichtung

Die Website verwendet den privaten Storage-Bucket `dienstplaene`. Direkte anonyme Zugriffsregeln werden nicht benötigt und sollen geschlossen bleiben.

## Edge Function

Die Funktion liegt unter `supabase/functions/dienstplan-api/index.ts` und muss unter dem Namen `dienstplan-api` bereitgestellt werden. Die JWT-Prüfung des Supabase-Gateways muss für diese Funktion deaktiviert sein; die Funktion prüft ihre eigenen zeitlich begrenzten Sitzungen.

## Geschützte Funktionswerte

Folgende Secrets müssen in Supabase für Edge Functions hinterlegt werden:

- `VIEW_PASSWORD`: Passwort für die normale Ansicht
- `ADMIN_PASSWORD`: separates Passwort für Upload und Löschen
- `SESSION_SECRET`: lange zufällige Zeichenfolge mit mindestens 32 Zeichen

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` werden von Supabase für bereitgestellte Edge Functions automatisch bereitgestellt. Der Service-Role-Schlüssel darf niemals in Website-Dateien oder GitHub-Secrets für die statische Seite eingetragen werden.

## Storage

- Bucket: `dienstplaene`
- öffentlich: nein
- maximale Dateigröße: 20 MB
- erlaubter MIME-Typ: `application/pdf`

Die Funktion erzeugt kurzlebige Anzeige- und Upload-Freigaben. Die Website selbst kennt ausschließlich den öffentlichen Publishable Key.
