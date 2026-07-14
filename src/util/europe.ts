/** Europe (EU/EEA/UK/CH) as ISO-3166 alpha-2 — for filtering job locations. */
export const EUROPE_ALPHA2 = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'GB', 'CH', 'NO', 'IS', 'LI',
]);

/** Europe as ISO-3166 alpha-3 — the form some search APIs expect as a filter. */
export const EUROPE_ALPHA3 = [
  'DEU', 'GBR', 'IRL', 'FRA', 'ESP', 'ITA', 'NLD', 'LUX', 'POL', 'SWE', 'PRT',
  'AUT', 'CZE', 'ROU', 'BEL', 'FIN', 'EST', 'DNK', 'CHE', 'GRC', 'HUN', 'SVK',
  'SVN', 'LTU', 'LVA', 'HRV', 'BGR', 'NOR',
];

/** True if `code` is a European ISO-3166 alpha-2 country code (case-insensitive). */
export function isEuropeAlpha2(code: string | undefined | null): boolean {
  return code != null && EUROPE_ALPHA2.has(code.trim().toUpperCase());
}

/**
 * Europe as country names — for APIs that give a spelled-out country rather than
 * a code (e.g. Ashby's `address.postalAddress.addressCountry`). Includes the
 * spelling variants those feeds actually emit.
 */
export const EUROPE_COUNTRY_NAMES = new Set([
  'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czechia',
  'czech republic', 'denmark', 'estonia', 'finland', 'france', 'germany',
  'greece', 'hungary', 'iceland', 'ireland', 'italy', 'latvia',
  'liechtenstein', 'lithuania', 'luxembourg', 'malta', 'netherlands',
  'the netherlands', 'norway', 'poland', 'portugal', 'romania', 'slovakia',
  'slovenia', 'spain', 'sweden', 'switzerland', 'united kingdom', 'uk',
  'great britain', 'england', 'scotland', 'wales', 'northern ireland',
]);

/** True if `name` is a European country name (case-insensitive). */
export function isEuropeCountryName(name: string | undefined | null): boolean {
  return name != null && EUROPE_COUNTRY_NAMES.has(name.trim().toLowerCase());
}

/** European countries and their main tech hubs, as they appear in free text. */
const EUROPE_LOCATION_TEXT =
  /\b(united kingdom|uk|england|london|cambridge|france|paris|germany|berlin|munich|netherlands|amsterdam|ireland|dublin|switzerland|zurich|zürich|italy|milan|spain|madrid|barcelona|poland|warsaw|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|austria|vienna|belgium|brussels|portugal|lisbon|czech|prague|romania|bucharest|hungary|budapest)\b/i;
/** Non-European countries and hubs, used to reject what the list above misses. */
const NON_EUROPE_LOCATION_TEXT =
  /\b(us|usa|united states|canada|india|singapore|japan|australia|brazil|mexico|korea|china|san francisco|california|mountain view|new york|seattle|bellevue|kirkland|los angeles|washington|texas|austin)\b/i;

/**
 * Best-effort Europe check for a free-text location ("Berlin, Germany") — for
 * feeds that give no country code. A known European hub wins; anything else is
 * kept unless it names a non-European one, so an unrecognised or missing
 * location reaches the LLM rather than being dropped silently.
 */
export function isEuropeLocationText(location: string | undefined | null): boolean {
  if (!location) return true;
  if (EUROPE_LOCATION_TEXT.test(location)) return true;
  return !NON_EUROPE_LOCATION_TEXT.test(location);
}
