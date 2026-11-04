/**
 * Prosecutor's file gags (Brief §2.1): adjective + offence, written per language (adapted, not translated literally).
 * Harmless misdemeanours only – no drugs, alcohol, tobacco, weapons, real places or people (Brief §2.4).
 */
export const OFFENCES: { en: string; de: string }[] = [
  { en: 'Unauthorised cake removal', de: 'Unerlaubte Kuchenentnahme' },
  { en: 'Honking after curfew', de: 'Hupen nach der Sperrstunde' },
  { en: 'Sock smuggling (left feet only)', de: 'Sockenschmuggel (nur linke)' },
  { en: 'Cheese forgery', de: 'Käsefälschung' },
  { en: "Napping in the mayor's hammock", de: 'Nickerchen in der Hängematte des Bürgermeisters' },
  { en: 'Form 27b filled in the wrong colour', de: 'Formular 27b in falscher Farbe ausgefüllt' },
  { en: 'Excessive kazoo use', de: 'Übermäßiger Kazoo-Gebrauch' },
  { en: 'Rearranging the town hall chairs', de: 'Umstellen der Rathausstühle' },
  { en: 'Impersonating a lamp post', de: 'Sich als Laterne ausgeben' },
  { en: 'Unlicensed puddle jumping', de: 'Pfützenspringen ohne Genehmigung' },
  { en: 'Pie-related conspiracy', de: 'Verschwörung in Sachen Kuchen' },
  { en: 'Whistling in a quiet zone', de: 'Pfeifen in der Ruhezone' },
  { en: 'Borrowing a duck without asking', de: 'Ente ohne Nachfrage ausgeliehen' },
  { en: 'Tying the ferryman’s laces together', de: 'Schnürsenkel des Fährmanns verknotet' },
  { en: 'Counterfeit library stamps', de: 'Gefälschte Büchereistempel' },
  { en: 'Moving the bakery sign two metres left', de: 'Bäckerschild zwei Meter versetzt' },
  { en: 'Feeding the town clock', de: 'Rathausuhr gefüttert' },
  { en: 'Laughing during a filing', de: 'Lachen während einer Ablage' },
  { en: 'Late return of a borrowed umbrella (11 years)', de: 'Verspätete Rückgabe eines Schirms (11 Jahre)' },
  { en: 'Painting a moustache on the founder statue', de: 'Schnurrbart an die Gründerstatue gemalt' },
  { en: 'Operating a lemonade stand without a stamp', de: 'Limonadenstand ohne Stempel betrieben' },
  { en: 'Unauthorised use of the good scissors', de: 'Unbefugte Benutzung der guten Schere' },
  { en: 'Spreading rumours about the weather', de: 'Gerüchte über das Wetter verbreitet' },
  { en: 'Hoarding rubber ducks', de: 'Horten von Gummienten' },
  { en: 'Sitting in the reserved seat', de: 'Auf dem reservierten Platz gesessen' },
  { en: 'Swapping the post office queue order', de: 'Reihenfolge in der Postschlange vertauscht' },
  { en: 'Training pigeons to sing', de: 'Tauben das Singen beigebracht' },
  { en: 'Excessive confetti on a weekday', de: 'Übermäßiges Konfetti an einem Werktag' },
  { en: 'Missing receipt for a sandwich', de: 'Fehlender Beleg für ein Butterbrot' },
  { en: 'Wearing slippers to a meeting', de: 'In Pantoffeln zur Sitzung erschienen' },
  { en: 'Uninvited choir performance', de: 'Ungebetener Chorauftritt' },
  { en: 'Stealing the last biscuit', de: 'Den letzten Keks entwendet' },
];
export const ADJECTIVES: { en: string; de: string }[] = [
  { en: 'notorious', de: 'berüchtigt' }, { en: 'repeat-offending', de: 'rückfällig' }, { en: 'well-meaning', de: 'gutmeinend' },
  { en: 'slightly sticky', de: 'leicht klebrig' }, { en: 'unrepentant', de: 'uneinsichtig' }, { en: 'polite', de: 'höflich' },
  { en: 'chronically late', de: 'chronisch verspätet' }, { en: 'overly honest', de: 'übertrieben ehrlich' },
];
export const SPECIES_NAME: Record<string, { en: string; de: string }> = {
  raccoon: { en: 'Raccoon', de: 'Waschbär' }, weasel: { en: 'Weasel', de: 'Wiesel' }, cat: { en: 'Cat', de: 'Kater' },
  fox: { en: 'Fox', de: 'Fuchs' }, marten: { en: 'Marten', de: 'Marder' },
};
