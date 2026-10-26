# Private Testumgebung

Der private Zugriff ist erst aktiv, wenn die Repository-Änderungen bereitgestellt und die folgenden Dashboard-Schritte erledigt sind. Es wurde nichts deployed.

## Supabase

1. Wende `supabase/migrations/20261025122200_private_test_access.sql` auf das bestehende Projekt an. Sie legt die App-Allowlist und Admin-Funktionen an, sperrt den Supabase-Data-API-Zugriff für nicht freigeschaltete Konten, macht Profilbilder privat und verlangt autorisierte private Realtime-Kanäle.
2. Wende danach `supabase/migrations/20261029000000_grant_service_role_site_access.sql` an. Sie gewährt dem ausschließlich serverseitig verwendeten `service_role` Leserechte auf die Allowlist- und Admin-Tabellen, die der Username-Login zur Zugriffsprüfung abfragt.
3. Prüfe, dass beide Migrationen ohne Fehler abgeschlossen wurden. Die erste konfiguriert `pgrst.db_pre_request` für die Data API.
4. Deaktiviere in **Authentication → Settings** die öffentliche Registrierung („Allow new users to sign up“).
5. Deaktiviere in den **Realtime Settings** den öffentlichen Kanalzugriff („Allow public access“). Die Partie verwendet nun private Kanäle.
6. Neue Testkonten müssen im Supabase-Dashboard angelegt werden, bevor ein Admin sie unter **Administration → Testzugriff** per E-Mail oder Benutzername freigibt.

Der Server benötigt `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` und `SUPABASE_SERVICE_ROLE_KEY`. Der Service-Role-Key darf niemals als `NEXT_PUBLIC_*` veröffentlicht werden.

## Cloudflare

1. In **Zero Trust → Access → Applications** eine Self-hosted-Anwendung für `chesscage.com` anlegen; `www.chesscage.com` ebenfalls aufnehmen, falls diese Domain erreichbar ist.
2. Eine Allow-Policy für die ausgewählten E-Mail-Adressen einrichten und den gewünschten Identity Provider aktivieren. Dadurch können die freigegebenen Personen die App auf unterschiedlichen Geräten nutzen.
3. Alle Pfade schützen, einschließlich Seiten, `/api/*`, Assets, Manifest und `/sw.js`. Eine schlichte Blockseite kann auf den privaten Testbetrieb hinweisen.
4. Keine öffentlichen Worker- oder Preview-Adressen als alternativen Zugang belassen. `wrangler.jsonc` schaltet `workers.dev` und Preview-URLs aus und routet Assets zuerst durch den Worker; nach Deployment die tatsächlichen Worker- und Domain-Einstellungen dennoch kontrollieren.
5. Eine kurze Access-Sitzungsdauer wählen. Die Access-E-Mail und das ChessCage-Supabase-Konto sind zwei getrennte Freigaben.

## Konten freigeben und sperren

- **Freigeben:** Konto im Supabase-Dashboard anlegen, seine E-Mail in der Cloudflare-Access-Policy freigeben und im Adminbereich unter **Testzugriff** das Konto aktivieren.
- **Sperren:** Im Adminbereich den App-Zugriff deaktivieren und die E-Mail zusätzlich aus der Cloudflare-Access-Policy entfernen. Die Admin-Oberfläche kann Cloudflare nicht selbst ändern.
- Admin-Konten, die in `site_admins` stehen, behalten App-Zugriff.

Data-API-Anfragen und Storage-/Realtime-Zugriffe werden zusätzlich in Supabase kontrolliert. Der Supabase-Data-API-Pre-Request-Hook schützt nur PostgREST; Storage und Realtime werden separat durch RLS und private Buckets/Kanäle begrenzt.

## PWA und Widerruf

Der neue Service Worker speichert keine App-Seiten oder App-Assets offline und löscht beim nächsten Update ältere `schach-offline-*`-Caches. Öffne jede installierte PWA einmal online, damit sie das Update erhält. Inhalte, die ein Gerät bereits geladen hat, lassen sich nicht aus der Ferne von einem Gerät löschen, das offline bleibt. Bereits offene Seiten oder Realtime-Verbindungen können außerdem bis zur nächsten Prüfung bzw. Verbindungs-/Sitzungsaktualisierung bestehen bleiben.

Vor dem privaten Betrieb daher mit einem nicht freigegebenen Browser testen: Domain- und Worker-URLs, Seiten, APIs, Supabase-REST/RPC, Storage, Realtime sowie eine installierte PWA. Die Zugangssperre ist erst nach erfolgreicher externer Konfiguration und diesem Test wirksam.
