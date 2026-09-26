// Guard against a model INVENTING clock times. Found in the owner's demo: a Spanish note that said only "Hola, soy Kevin.
// Están aquí en el job site. We just arrived." came back with an arrival time of 08:00 for Kevin (leaked from another
// worker's "like 8am" in the job context). Nobody said 8. Invented times end up on an invoice.
//
// Rule: a labor entry may only keep an arrival/departure time if the speaker actually said something time-like. If the
// transcript contains no time expression at all, both times are dropped (the note's own timestamp still records WHEN it
// was said). Deliberately permissive — one time-ish word anywhere keeps the model's answer — so a real "arrived at eight"
// is never stripped; it only removes times from transcripts that contain nothing time-like whatsoever.

const NUMBER_WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "noon", "midnight",
  "uno", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "mediodia", "mediodía",
];
const DAY_PARTS = ["morning", "afternoon", "evening", "tonight", "mañana", "manana", "tarde", "noche", "madrugada"];

const TIME_HINT = new RegExp(
  String.raw`(\d|\b(?:a\.?m\.?|p\.?m\.?)(?![a-z])|o'?clock|\b(?:${[...NUMBER_WORDS, ...DAY_PARTS].join("|")})\b)`,
  "i",
);

/** True when the text contains anything that reads like a time of day (digits, am/pm, "eight", "mañana", …). */
export function mentionsATime(text: string): boolean {
  return TIME_HINT.test(text);
}

interface HasLaborTimes {
  labor: Array<{ arrivalTime?: string | null; departureTime?: string | null }>;
}

/** Removes arrival/departure times from every labor entry when the speaker never said a time. Returns a new object. */
export function dropUnspokenTimes<T extends HasLaborTimes>(parsed: T, spokenText: string): T {
  if (mentionsATime(spokenText)) return parsed;
  if (!parsed.labor.some((entry) => entry.arrivalTime || entry.departureTime)) return parsed;
  return {
    ...parsed,
    labor: parsed.labor.map((entry) => {
      const { arrivalTime, departureTime, ...rest } = entry;
      void arrivalTime; void departureTime;
      return rest;
    }),
  };
}
