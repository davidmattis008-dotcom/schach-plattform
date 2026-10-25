This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Supabase-Datenbank

Community, Profilbearbeitung, Avatare und Ranglisten benötigen die SQL-Migrationen in `supabase/migrations`. Verknüpfe das Supabase-Projekt mit der CLI (`supabase link --project-ref <project-ref>`) und führe `supabase db push` aus. Alternativ können alle noch nicht angewendeten Migrationsdateien der Reihe nach im Supabase SQL Editor ausgeführt werden. Ohne diese Migrationen funktionieren Suche, Chat, Profiländerungen und Ranglisten nicht.

### Fortschritt auf mehreren Geräten

Für die Synchronisierung von Lern-, Taktik- und Endspielfortschritt ist zusätzlich `20261024000000_account_learning_progress.sql` erforderlich. Für die Einstufung der Taktik-Elo und die wählbare Aufgabenstärke kommen `20261026000000_tactics_elo_placement.sql`, `20261027000000_fix_legacy_tactics_rating_scale.sql` und `20261028000000_preserve_daily_learning_progress.sql` hinzu. Wende die Migrationen nach den vorhandenen Migrationen in Zeitstempelreihenfolge mit `supabase db push` oder im SQL Editor an. Ein Deployment allein führt Datenbankmigrationen nicht aus. Bei angemeldeten Konten wird bestehender lokaler Fortschritt beim ersten Abgleich in das jeweilige Konto übernommen; abgeschlossene Online-Partien auf dem Gerät werden ebenfalls in den Kontoverlauf hochgeladen. Die lokale Partieliste wird beim ersten erfolgreichen Abgleich einem Konto zugeordnet und bei einem späteren Kontowechsel nicht mit dem anderen Konto zusammengeführt. Bei Gästen bleiben diese Daten lokal. Supabase-Zugriffe auf den Fortschritt laufen ausschließlich über eine authentifizierte RPC, die Datensätze anhand der angemeldeten Nutzer-ID isoliert. Die Synchronisierung reduziert Verluste durch Gerätewechsel oder Browserdatenlöschung, ist aber kein Ersatz für unabhängige Datenbank-Backups; Sicherungsmöglichkeiten und Aufbewahrung hängen vom Supabase-Tarif und der Projektkonfiguration ab.

### Passwort-Reset

Damit Reset-Links auch dann funktionieren, wenn der E-Mail-Link in einem anderen Browser geöffnet wird, unterstützt `/auth/callback` sowohl PKCE-Codes als auch Supabase-Token-Hashes. Setze in Supabase unter **Authentication → URL Configuration** die Site URL auf `https://www.chesscage.com` und füge `https://www.chesscage.com/auth/callback` zur Redirect URL Allow List hinzu. Verwende unter **Authentication → Email Templates → Reset Password** diesen Link:

```html
<h2>Passwort zurücksetzen</h2>
<p>Du hast angefordert, dein CHESSCAGE-Passwort zurückzusetzen. Über den folgenden Link kannst du ein neues Passwort festlegen:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Passwort zurücksetzen</a></p>
```

Die App tauscht den einmaligen Recovery-Token gegen eine Sitzung aus und leitet danach auf `/update-password` weiter. Teile Reset-Links oder Token niemals mit anderen.

## Lizenz- und Herkunftshinweise

Die 10.000 Schachtaktik-Datensätze in `lib/tactics-data.json` stammen aus der Lichess Open Database und stehen laut [Lichess-Datenbankhinweisen](https://database.lichess.org/) unter CC0. Die Quelldatenwerte (400–2999) werden auf die interne Taktik-Skala von 0–3000 abgebildet; die ursprünglichen Werte bleiben zur Nachvollziehbarkeit enthalten. Die feste Ausgangsauswahl liegt in `lib/tactics-base-data.json`; mit `node scripts/import-tactics.mjs --input <lichess-puzzle.csv.zst>` lässt sich die Auswahl mit dem gespeicherten Seed reproduzieren. Bei jeder Stellung wird der erste Zug der Quelldaten automatisch ausgespielt, bevor die eigentliche Lösung beginnt. Die lokal bereitgestellte Stockfish.js-Engine in `public/stockfish/` steht unter GPLv3; Lizenztext und Versions-/Quellcodeangaben befinden sich neben den Dateien in `Copying.txt` und `README.txt`. Vor einer Weiterverteilung geänderter Engine-Dateien müssen die GPLv3-Pflichten, insbesondere zu Lizenzhinweisen und korrespondierendem Quellcode, eingehalten werden.

## Adminbereich und Moderation

Die Adminoberfläche ist unter `/admin` verfügbar, nachdem `20261007000008_admin_moderation.sql` angewendet und ein Konto in `public.site_admins` eingetragen wurde. Die erste Owner-Rolle muss direkt im Supabase SQL Editor vergeben werden:

```sql
insert into public.site_admins (user_id, role)
select p.id, 'owner'
from public.profiles p
where p.username = 'DEIN_BENUTZERNAME'
on conflict (user_id) do update set role = 'owner';

select p.username, a.role
from public.site_admins a
join public.profiles p on p.id = a.user_id
where a.role = 'owner';
```

Ersetze `DEIN_BENUTZERNAME` durch den exakten Profilnamen und prüfe, dass die zweite Abfrage dein Konto als `owner` ausgibt. Der Adminbereich unterstützt Kontosperren, Adminmitteilungen, die Prüfung ausdrücklich gemeldeter Chatnachrichten, das Entfernen von Profilbiografie/-bild sowie ein Maßnahmenprotokoll. Private Nachrichten werden Moderatoren nicht pauschal angezeigt; nur eine vom Empfänger gemeldete Nachricht erscheint in der Moderationsansicht.

Für Kontosperren und die Username-Anmeldung muss zusätzlich `SUPABASE_SERVICE_ROLE_KEY` als **serverseitige, geheime** Umgebungsvariable in Vercel gesetzt und die Anwendung neu bereitgestellt werden. Der Schlüssel darf niemals `NEXT_PUBLIC_` heißen oder im Browser verfügbar sein. Ohne diese Variable verweigert der Server die jeweilige Funktion.

Die Anmeldung akzeptiert E-Mail-Adresse oder Benutzernamen. Dafür muss `20261009000004_case_insensitive_usernames.sql` im Supabase SQL Editor ausgeführt werden. Die Migration verhindert Benutzernamen, die sich nur in Groß-/Kleinschreibung unterscheiden, und richtet die geschützte serverseitige Auflösung des Benutzernamens zur Auth-E-Mail ein. Falls die Migration wegen bestehender Namen wie `David` und `david` abbricht, müssen diese Profile zuerst manuell auf unterschiedliche Benutzernamen geändert werden; die Migration ändert bestehende Namen nicht automatisch.

Supportanfragen unter `/support` verwenden zusätzlich die Migration `20261007000009_private_support_inbox.sql`. Nutzer sehen nur ihre eigenen Anfragen und Antworten; im Adminbereich sind Supportinhalte ausschließlich für Rollen `owner` und `admin` lesbar (nicht für Moderatoren oder andere Nutzer). Nachrichten und Statusänderungen laufen über zugriffsgeschützte RPCs und Adminantworten/-statusänderungen werden protokolliert.

Der Menüpunkt `/tournaments` stellt private, angemeldeten Nutzern vorbehaltene Rundenturniere bereit. Dazu muss zusätzlich `20261007000010_tournaments.sql` nach den vorherigen Migrationen ausgeführt werden. Beide Teilnehmer müssen dasselbe Ergebnis melden; dann wird die Elo beider Spieler genau einmal über die normale Elo-Funktion im zur Zeitkontrolle passenden Modus (Bullet, Blitz, Rapid oder Klassisch) aktualisiert. Ergebnisse werden nicht automatisch vom Partie-Server geprüft.

`20261007000011_account_improvements.sql` aktiviert Herausforderungen unter Freunden, private Blockierungen, kontoübergreifende Online-Partieverläufe und Support-Antwortbenachrichtigungen. Führe die Migration nach `20261007000010_tournaments.sql` aus. Blockieren entfernt auch eine bestehende Freundschaft; nach dem Entblocken muss eine Freundschaft neu angefragt werden.

Der kostenlose Vereinsbereich unter `/verein` benötigt `20261009000000_chess_club_training.sql`, `20261009000001_chess_club_member_management.sql`, `20261009000002_chess_club_administration.sql`, `20261009000003_chess_club_member_exit.sql` und anschließend `20261010090000_saved_tactics.sql`, ausgeführt nach den bisherigen Migrationen. Er ermöglicht Vereine und Trainingsgruppen mit Einladungscodes, trainerseitig zugewiesene Taktikaufgaben, gemeinsame Pläne mit Fristen und Teamzielen, Teilnahmeübersichten und gruppeninterne Rundenturniere. Persönlich gespeicherte Taktikaufgaben können im Vereinstraining ausgewählt und den Gruppenmitgliedern zugewiesen werden. Die Mitgliederverwaltung zeigt alle Vereinsmitglieder; der Vereinsgründer kann andere Mitglieder aus dem Verein und allen seinen Gruppen entfernen. Beigetretene Mitglieder können den Verein verlassen; Gründer müssen zuvor die Verantwortung übertragen oder den Verein löschen. Beim Austritt werden offene Turnieranmeldungen und Gruppenzugehörigkeiten entfernt. Der Gründer kann außerdem Verein, Gruppen, Trainingspläne, Aufgaben und offene Turniere bearbeiten oder löschen. Die Vereinslöschung entfernt die zugehörigen Vereinsdaten; bereits verbuchte Online-Wertungen bleiben bestehen. Laufende oder beendete Turniere können nicht bearbeitet oder einzeln gelöscht werden, damit ihre Ergebnisse erhalten bleiben. Die Migrationen schützen die Vereinsdaten über RLS und zugriffsbeschränkte RPCs. Die zusätzliche Vereinsverwaltung in `/admin` ist ausschließlich dem Admin-Konto `DavidBickle` zugänglich, sofern es in `public.site_admins` eingetragen ist; es erhält damit Verwaltungszugriff auf alle Vereine, einschließlich der Möglichkeit, Gründer zu entfernen. Änderungen an der Datenbank werden nicht durch ein Vercel-Deployment angewendet: Verknüpfe das Supabase-Projekt und führe `supabase db push` aus oder wende alle noch nicht angewendeten Migrationen der Reihe nach im Supabase SQL Editor an.

Der Lernpfad unter `/lernen` bietet jeden Tag genau eine wechselnde Aufgabe aus Taktik, Theorie, Endspiel, Mattsetzen oder Eröffnung. Erklärungen und Fortschritt werden im Lernpfad angezeigt; es gibt dort keine zusätzliche Lektionenliste. Der interaktive Regelkurs unter `/lernen/regeln` erklärt Figurenbewegungen und Schlagen, Schach, Rochade, En passant, Umwandlung, Matt, Patt, Remis und wichtige Turnierregeln direkt auf einem bedienbaren Schachbrett. Der Bereich `/lernen/endspiele` umfasst 500 Schachbrettübungen: Jede Lösung wird Zug für Zug durchgespielt und erklärt, anschließend wird die Endspielidee an einer neuen Stellung derselben Kategorie selbst angewendet. Die Endspielaufgaben stammen aus der Lichess-Puzzledatenbank (CC0), sind lokal im Repository enthalten und benötigen weder Supabase noch einen kostenpflichtigen externen Dienst. Den Datensatz kann man mit Node.js 24 oder neuer und `npm run import:endgame-exercises -- --input lichess_db_puzzle.csv.zst` neu erstellen. Die Aufgabenbibliothek umfasst außerdem über 1.000 unterschiedliche, nach Lichess-Aufgaben-Elo bewertete Taktikstellungen; die Auswahl richtet sich nach der lokalen Taktik-Elo und bereits gelöste oder versuchte Aufgaben werden erst wiederholt, wenn alle unverbrauchten Aufgaben ausgeschöpft sind. Taktik-, Lern- und Endspielfortschritt werden lokal im Browser gespeichert und bei Anmeldung mit dem Konto synchronisiert, sofern alle Lernfortschrittsmigrationen einschließlich `20261028000000_preserve_daily_learning_progress.sql` angewendet wurden. Gespeicherte Taktikaufgaben werden dem angemeldeten Konto zugeordnet und können in „Analyse“ mit der lokalen Stockfish-Engine untersucht sowie nach eigener Auswahl im Vereinstraining mit Gruppenmitgliedern geteilt werden. `/repertoire` enthält ein durchsuchbares Eröffnungslernen mit kuratierten Varianten und benannten ECO-Linien aus der [Lichess Open Database](https://github.com/lichess-org/chess-openings), die unter CC0 veröffentlicht ist. Die Datenbank kann mit Node.js 24 oder neuer und `npm run import:opening-database` aktualisiert und mit `npm run test:opening-repertoire` geprüft werden. Sie deckt bekannte ECO-Eröffnungen und Linien ab, aber nicht jede mögliche Zugfolge oder Schach-Transposition. Eröffnungen können für Weiß und Schwarz interaktiv gelernt oder vollständig durchgespielt werden; der Lernfortschritt wird bei Anmeldung mit dem Konto synchronisiert, sofern die genannten Migrationen angewendet wurden. Profilstatistiken fassen die gewerteten Online-Partien nach Siegen, Remis, Niederlagen und Siegquote zusammen.

Der Mattkurs unter `/lernen/mattsetzen` beginnt mit eigenen Versuchen am interaktiven Brett, erklärt anschließend die Lösungszüge einzeln und schließt jede Methode mit einem Verständnis-Test ab. Er umfasst sieben typische Mattbilder (Narrenmatt, Schäfermatt, Grundreihenmatt, ersticktes Matt, arabisches Matt, Dovetail-Matt und gedecktes Randmatt), Mattführungen mit König+Dame, König+Turm, zwei Türmen, zwei Läufern sowie Läufer+Springer und erklärt die Grenzen bei unzureichendem Material und zwei Springern gegen den alleinstehenden König. Die vollständige Läufer-und-Springer-Variante zeigt alle 61 Halbzüge bis zum Matt. Der Fortschritt wird lokal gespeichert; für diesen Kurs ist keine Supabase-Migration erforderlich. `npm run test:checkmate-training` prüft die Zuglegalität und das Mattende aller Varianten.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
