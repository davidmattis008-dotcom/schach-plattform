import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Datenschutzhinweise",
  description: "Informationen zur Verarbeitung personenbezogener Daten auf der Schachplattform.",
};

const outstandingDetails = [
  "Name bzw. Organisation und ladungsfähige Anschrift der verantwortlichen Stelle",
  "Kontaktadresse für Datenschutzanfragen und Rückmeldungen",
  "Projektregionen, Auftragsverarbeitungsverträge und mögliche Drittlandübermittlungen der eingesetzten Anbieter",
  "Konkrete Speicher- und Löschfristen sowie der Ablauf für Kontolöschungen",
  "Rechtsgrundlagen für die einzelnen Verarbeitungen und die Frage, ob sich Minderjährige anmelden dürfen",
  "Tatsächliche Hosting-/Serverprotokolle und die vollständige Prüfung von Cookies und lokalem Speicher",
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100 sm:px-8 sm:py-14">
      <article className="mx-auto max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Vorläufige Datenschutzhinweise – noch unvollständig</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Datenschutzhinweise</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Diese Hinweise erklären, welche personenbezogenen Daten die Schachplattform verarbeitet, wofür sie verwendet werden und welche Rechte betroffene Personen haben. Die Plattform befindet sich in der Beta-Phase; Funktionen und Datenflüsse können sich ändern.
        </p>

        <div className="mt-8 space-y-8">
          <section>
            <h2 className="text-xl font-semibold">1. Verantwortlicher und Kontakt</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Die Angaben zur verantwortlichen Person oder Organisation und deren ladungsfähige Anschrift sowie eine Kontaktadresse für Datenschutzanfragen fehlen derzeit. Dieser Abschnitt ist deshalb noch nicht vollständig.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Daten, Zwecke und Rechtsgrundlagen</h2>
            <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-300">
              <li><strong>Konto und Anmeldung:</strong> E-Mail-Adresse und Authentifizierungsdaten zur Einrichtung und Sicherung des Kontos sowie zur Bereitstellung angemeldeter Funktionen. Das Passwort wird über Supabase Auth verarbeitet und nicht als Klartext an die Website weitergegeben. Eine mögliche Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO); bitte rechtlich prüfen.</li>
              <li><strong>Spielerprofil:</strong> Benutzername, freiwillige Biografie und Avatarbild. Profilangaben können anderen Nutzern angezeigt werden; öffentliche Profil- und Avataransichten sind teilweise auch ohne Anmeldung abrufbar. Rechtsgrundlage und Umfang der öffentlichen Sichtbarkeit müssen vom Betreiber bestätigt werden.</li>
              <li><strong>Community-Inhalte:</strong> Freundschaftsanfragen, globale Chatnachrichten, private Nachrichten, Vereinsaktivitäten, Supportanfragen, Turniere, Spielergebnisse und Wertungen werden verarbeitet, um die jeweiligen Community-Funktionen bereitzustellen, zu moderieren und Missbrauch zu bearbeiten. Nachrichten können Namen, Inhalte und Zeitpunkte enthalten; globale Chat-Inhalte sind für angemeldete Nutzer sichtbar, private Nachrichten für die beteiligten Personen.</li>
              <li><strong>Partien und Training:</strong> Züge, Ergebnisse und Wertungsdaten können zur Anzeige von Partien, Verlauf, Ranglisten und Trainingsfortschritt verarbeitet werden. Taktikfortschritt und abgeschlossene Lernlektionen werden zunächst im Browser gespeichert und bei Anmeldung mit dem jeweiligen Konto synchronisiert. Abgeschlossene Online-Partien werden für angemeldete Konten in Supabase gespeichert; lokale Partien werden beim nächsten Kontoabgleich dorthin übertragen. Bei Gästen verbleiben diese Fortschritte und Partien auf dem jeweiligen Gerät. Gespeicherte Taktikaufgaben werden dem angemeldeten Konto zugeordnet; wenn sie ausdrücklich einer Vereinsgruppe zugewiesen werden, sind sie für deren Mitglieder als Trainingsaufgabe sichtbar.</li>
              <li><strong>ChessCageAI Memory und Trainingsplan:</strong> Wenn du ChessCageAI-Erinnerungen ausdrücklich speicherst, werden kurze Texte zu deinen Trainingszielen, deiner Spielstärke, Schwächen und Präferenzen deinem Konto in Supabase zugeordnet. Du kannst sie in den Einstellungen einsehen und einzeln oder vollständig löschen. Eine Stockfish-Partieanalyse wird nur dann als kurzer Trainingsschwerpunkt gespeichert, wenn du diese Schaltfläche ausdrücklich auswählst; Partie, Züge und Engine-Varianten werden dabei nicht übernommen. Der persönliche Wochenplan speichert deine verfügbare Trainingszeit, gewählte Trainingsbereiche, konkrete Aufgaben und deren Erledigungsstatus. Für die Planberechnung werden Elo- und Lernfortschritt, zusammengefasste Ergebnisse der letzten gespeicherten Partien sowie passende Erinnerungen verwendet. Die Planberechnung benötigt derzeit kein Textmodell.</li>
              <li><strong>ChessCageAI-Textmodell:</strong> Wenn das lokale Ollama-Modell für den Server eingerichtet ist, werden deine jeweilige Frage und die dafür ausgewählten Daten (zum Beispiel übermittelte Stockfish-Ergebnisse, passende gespeicherte Erinnerungen oder gefundene ChessCage-Wissensauszüge) an diese lokale Ollama-Instanz gesendet. Es wird kein externer KI-Anbieter eingebunden. Chats werden nicht dauerhaft als Memory gespeichert. Modell- oder Zugangsdaten werden nicht an den Browser übermittelt.</li>
              <li><strong>Optionale ChessCageAI-Spracheingabe und -ausgabe:</strong> Erst wenn du die Mikrofontaste betätigst, fragt der Browser nach der Mikrofonberechtigung und nimmt höchstens 20 Sekunden Audio auf. Das offene Whisper-Modell verarbeitet die Aufnahme lokal im Browser; die Audiodaten werden weder hochgeladen noch dauerhaft gespeichert und die temporäre Aufnahme wird nach der Erkennung freigegeben. Die erkannten Wörter erscheinen zunächst im Texteingabefeld und werden erst nach deiner Bestätigung wie eine normale Chatfrage verarbeitet. Für das Vorlesen wird ausschließlich eine deutsche Stimme verwendet, die der Browser als lokal installiert kennzeichnet; es wird keine Audioausgabe an einen Sprachdienst gesendet oder als Datei gespeichert. Die Whisper-Modellgewichte werden beim ersten Einsatz vom Hugging-Face-Modellserver geladen und können im lokalen Browser-Modellcache verbleiben; dabei werden keine Aufnahmen übertragen.</li>
              <li><strong>Support und Beta-Feedback:</strong> Wenn du ein Problem oder einen Vorschlag übermittelst, verarbeiten wir die Angaben aus deiner Nachricht und – bei Supportanfragen innerhalb eines Kontos – die zugehörigen Kontodaten zur Bearbeitung.</li>
              <li><strong>Technischer Betrieb und Sicherheit:</strong> Server- und Sicherheitsprotokolle können durch Hosting- und Infrastruktur-Anbieter verarbeitet werden. Welche Angaben, Aufbewahrungsfristen und Rechtsgrundlagen dabei konkret gelten, hängt von den Anbieter-Einstellungen ab und muss vom Betreiber ergänzt werden.</li>
            </ul>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Die genannten Rechtsgrundlagen sind ein Entwurf, keine verbindliche rechtliche Bewertung. Je nach konkretem Zweck kommen insbesondere Vertragserfüllung, berechtigte Interessen oder eine Einwilligung in Betracht; das muss der Verantwortliche für jede Verarbeitung prüfen.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Cookies, lokaler Speicher und Offline-Funktionen</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Die Website ist nicht vollständig cookie-frei: Bei der Anmeldung können technisch erforderliche Sitzungs-/Authentifizierungs-Cookies von Supabase verwendet werden. Sie dienen der Anmeldung und Kontosicherheit. Zusätzlich nutzt die Website den lokalen Browserspeicher (localStorage) für Taktik- und Lernfortschritt, lokale Partieverläufe, das Installationsmerkmal der App und die Kenntnisnahme dieser Hinweise. Konto-Lernfortschritt und Online-Partieverläufe werden zusätzlich mit Supabase synchronisiert. Bei Gästen bleiben Lern- und lokale Partiedaten auf dem Gerät; Browserdaten können dort gelöscht werden.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Ein Service Worker speichert bestimmte App-Dateien und ausgewählte Spielseiten im Cache, damit Teile der Bot-Funktion offline verfügbar sind. Die Cache-Daten liegen auf dem Gerät und können über die Browser-/App-Daten gelöscht werden. Im geprüften Quellcode wurde kein Analyse- oder Werbe-Cookie-Dienst gefunden; die tatsächlichen Produktions- und Anbieter-Einstellungen müssen dennoch geprüft werden.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Für die optionale lokale Spracheingabe lädt der Browser das offene Whisper-Modell beim ersten Gebrauch vom Hugging-Face-Modellserver; dieser Download enthält Modellgewichte, keine Mikrofonaufnahme. Die Sprachverarbeitung erfolgt auf dem Gerät. Eine lokale deutsche Betriebssystemstimme kann zum Vorlesen genutzt werden, sofern der Browser sie als lokal kennzeichnet.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Empfänger und Drittanbieter</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Für Authentifizierung, Datenbank, Community-Funktionen und Dateispeicherung wird Supabase verwendet. Die Website wird derzeit über Vercel bereitgestellt; der Betreiber muss Hosting-Anbieter, Projektregionen, mögliche Unterauftragnehmer und abgeschlossene Auftragsverarbeitungsverträge bestätigen. Bei einer Übermittlung in Länder außerhalb des EWR sind die dafür geltenden Garantien und Informationen hier zu ergänzen.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Speicherdauer und Löschung</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Browserdaten bleiben gespeichert, bis du sie in den Website-/Browserdaten löschst. Konto-, Profil-, Nachrichten-, Support-, Turnier- und Wertungsdaten werden in der Datenbank verarbeitet. Konkrete Löschfristen, ein möglicher Aufbewahrungszeitraum nach Kontolöschung und der Ablauf für die Löschung oder Anonymisierung müssen vom Betreiber noch festgelegt und hier angegeben werden. Gesetzliche Aufbewahrungspflichten bleiben unberührt.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              ChessCageAI Memory und Trainingspläne bleiben deinem Konto zugeordnet, bis du sie löschst oder dein Konto gelöscht wird. Erinnerungen kannst du in den Einstellungen einzeln oder gemeinsam entfernen; der Trainingsplan ist für die regelmäßige Neuberechnung vorgesehen. Es werden keine vollständigen ChessCageAI-Chats, technischen Logs oder vorübergehenden Stockfish-Berechnungen als Memory gespeichert.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Deine Rechte</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Im Rahmen der gesetzlichen Voraussetzungen kannst du Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit verlangen sowie einer Verarbeitung widersprechen. Eine erteilte Einwilligung kannst du mit Wirkung für die Zukunft widerrufen. Außerdem kannst du dich bei einer Datenschutzaufsichtsbehörde beschweren. Ein konkreter Kontaktweg für solche Anfragen wird noch ergänzt.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Beta-Phase und Rückmeldungen</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Die Schachplattform befindet sich in der Beta-Phase. Fehler, Ausfälle und Änderungen sind möglich. Angemeldete Nutzer können Fehler oder Anmerkungen über den <Link href="/support" className="font-medium text-amber-200 underline underline-offset-4">Supportbereich</Link> melden. Dafür ist ein Konto erforderlich. Bitte sende keine Passwörter und nur solche personenbezogenen Daten, die für die Bearbeitung erforderlich sind.
            </p>
          </section>

          <section className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
            <h2 className="text-lg font-semibold text-amber-200">Wichtiger Hinweis: Diese Informationen sind noch unvollständig</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Die folgenden Angaben liegen noch nicht vollständig vor. Diese Seite ist daher eine vorläufige Information und keine abschließend geprüfte Datenschutzerklärung.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
              {outstandingDetails.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          </section>

          <p className="text-xs text-slate-500">Stand: 26. Oktober 2026. Dieser Entwurf ist keine Rechtsberatung und ersetzt keine Prüfung durch eine qualifizierte Datenschutzberatung.</p>
        </div>
      </article>
    </main>
  );
}
