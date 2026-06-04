/**
 * COUNTRY GEO TABLE — name → ISO2 + centroid (lat, lon) for the World Map.
 *
 * Centroids are approximated to the country's geographic center (or
 * capital, whichever reads better at small bubble sizes). Values are
 * accurate enough for a Mercator bubble map at 900×420 px.
 *
 * The keys cover the most common TMDB `production_countries.name`
 * spellings. `aliasOf` lets older or alternative spellings map onto
 * the canonical entry.
 */

const COUNTRIES = {
    'United States of America': { iso: 'US', lat:  39.5, lon:  -98.5 },
    'United Kingdom':            { iso: 'GB', lat:  54.0, lon:   -2.0 },
    France:                      { iso: 'FR', lat:  46.6, lon:    2.2 },
    Germany:                     { iso: 'DE', lat:  51.2, lon:   10.4 },
    Italy:                       { iso: 'IT', lat:  42.8, lon:   12.6 },
    Spain:                       { iso: 'ES', lat:  40.2, lon:   -3.7 },
    Japan:                       { iso: 'JP', lat:  36.2, lon:  138.3 },
    'South Korea':               { iso: 'KR', lat:  36.6, lon:  127.9 },
    China:                       { iso: 'CN', lat:  35.9, lon:  104.2 },
    India:                       { iso: 'IN', lat:  20.6, lon:   78.9 },
    Canada:                      { iso: 'CA', lat:  56.1, lon: -106.3 },
    Mexico:                      { iso: 'MX', lat:  23.6, lon: -102.5 },
    Brazil:                      { iso: 'BR', lat: -14.2, lon:  -51.9 },
    Argentina:                   { iso: 'AR', lat: -38.4, lon:  -63.6 },
    Australia:                   { iso: 'AU', lat: -25.3, lon:  133.8 },
    'New Zealand':               { iso: 'NZ', lat: -40.9, lon:  174.9 },
    Russia:                      { iso: 'RU', lat:  61.5, lon:  105.3 },
    Sweden:                      { iso: 'SE', lat:  60.1, lon:   18.6 },
    Norway:                      { iso: 'NO', lat:  60.5, lon:    8.5 },
    Denmark:                     { iso: 'DK', lat:  56.3, lon:    9.5 },
    Finland:                     { iso: 'FI', lat:  61.9, lon:   25.7 },
    Netherlands:                 { iso: 'NL', lat:  52.1, lon:    5.3 },
    Belgium:                     { iso: 'BE', lat:  50.5, lon:    4.5 },
    Switzerland:                 { iso: 'CH', lat:  46.8, lon:    8.2 },
    Austria:                     { iso: 'AT', lat:  47.5, lon:   14.6 },
    Poland:                      { iso: 'PL', lat:  51.9, lon:   19.1 },
    'Czech Republic':            { iso: 'CZ', lat:  49.8, lon:   15.5 },
    Czechia:                     { iso: 'CZ', lat:  49.8, lon:   15.5 },
    Hungary:                     { iso: 'HU', lat:  47.2, lon:   19.5 },
    Romania:                     { iso: 'RO', lat:  45.9, lon:   24.9 },
    Greece:                      { iso: 'GR', lat:  39.1, lon:   21.8 },
    Portugal:                    { iso: 'PT', lat:  39.4, lon:   -8.2 },
    Ireland:                     { iso: 'IE', lat:  53.4, lon:   -8.2 },
    Iceland:                     { iso: 'IS', lat:  64.9, lon:  -19.0 },
    Turkey:                      { iso: 'TR', lat:  38.9, lon:   35.2 },
    Iran:                        { iso: 'IR', lat:  32.4, lon:   53.7 },
    Israel:                      { iso: 'IL', lat:  31.0, lon:   34.9 },
    'Hong Kong':                 { iso: 'HK', lat:  22.3, lon:  114.2 },
    Taiwan:                      { iso: 'TW', lat:  23.7, lon:  121.0 },
    Thailand:                    { iso: 'TH', lat:  15.9, lon:  101.0 },
    Vietnam:                     { iso: 'VN', lat:  14.1, lon:  108.3 },
    Indonesia:                   { iso: 'ID', lat:  -0.8, lon:  113.9 },
    Philippines:                 { iso: 'PH', lat:  12.9, lon:  121.8 },
    Singapore:                   { iso: 'SG', lat:   1.4, lon:  103.8 },
    Malaysia:                    { iso: 'MY', lat:   4.2, lon:  101.9 },
    Pakistan:                    { iso: 'PK', lat:  30.4, lon:   69.3 },
    Bangladesh:                  { iso: 'BD', lat:  23.7, lon:   90.4 },
    'South Africa':              { iso: 'ZA', lat: -30.6, lon:   22.9 },
    Egypt:                       { iso: 'EG', lat:  26.8, lon:   30.8 },
    Morocco:                     { iso: 'MA', lat:  31.8, lon:   -7.1 },
    Nigeria:                     { iso: 'NG', lat:   9.1, lon:    8.7 },
    Kenya:                       { iso: 'KE', lat:  -0.0, lon:   37.9 },
    Chile:                       { iso: 'CL', lat: -35.7, lon:  -71.5 },
    Colombia:                    { iso: 'CO', lat:   4.6, lon:  -74.3 },
    Peru:                        { iso: 'PE', lat:  -9.2, lon:  -75.0 },
    Cuba:                        { iso: 'CU', lat:  21.5, lon:  -77.8 },
    Ukraine:                     { iso: 'UA', lat:  48.4, lon:   31.2 },
    Lebanon:                     { iso: 'LB', lat:  33.9, lon:   35.9 },
};

// Convenient aliases for TMDB / OMDb spellings that drift over time.
const ALIASES = {
    'USA':                       'United States of America',
    'United States':             'United States of America',
    'US':                        'United States of America',
    'UK':                        'United Kingdom',
    'Great Britain':             'United Kingdom',
    'Korea, Republic of':        'South Korea',
    'Republic of Korea':         'South Korea',
    'Korea':                     'South Korea',
    'Russian Federation':        'Russia',
    'Soviet Union':              'Russia',
    'USSR':                      'Russia',
    'Iran, Islamic Republic of': 'Iran',
    // OMDb historical / alternate spellings
    'West Germany':              'Germany',
    'East Germany':              'Germany',
    'Czechoslovakia':            'Czech Republic',
    'Hong Kong SAR China':       'Hong Kong',
};

/** Resolve a TMDB country name to a geo record, or null if unknown. */
export function lookupCountry(name) {
    if (!name) return null;
    const canon = ALIASES[name] || name;
    const rec   = COUNTRIES[canon];
    return rec ? { name: canon, ...rec } : null;
}

/**
 * Aggregate a film array into per-country statistics.
 * Each film with N production countries contributes 1 count to each.
 *
 * @param {Array} films
 * @returns {Array<{ iso, name, count, films:Array, lat, lon }>}
 */
export function aggregateByCountry(films) {
    const map = new Map();
    films.forEach(m => {
        (m.countries || []).forEach(name => {
            const c = lookupCountry(name);
            if (!c) return;
            if (!map.has(c.iso)) map.set(c.iso, { ...c, count: 0, films: [] });
            const rec = map.get(c.iso);
            rec.count++;
            if (rec.films.length < 8) rec.films.push(m.title || '—');
        });
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * Project a (lat, lon) point to (x, y) on the equirectangular canvas.
 *  x = (lon + 180) / 360 * W
 *  y = (90  − lat) / 180 * H
 */
export function project(lat, lon, W = 900, H = 420) {
    return {
        x: ((lon + 180) / 360) * W,
        y: ((90  - lat) / 180) * H,
    };
}

/**
 * Aggregate films by ISO-2 country for the choropleth.
 * Each film contributes 1 to every production country it carries.
 *
 * @param {Array} films
 * @returns {Map<string, { iso, name, count, avg:number|null, films:Array }>}
 *   Keyed by ISO-2 so it joins directly against world-110m.json feature ids.
 */
export function aggregateByISO(films) {
    const map = new Map();
    (films || []).forEach(m => {
        (m.countries || []).forEach(rawName => {
            const c = lookupCountry(rawName);
            if (!c) return;
            if (!map.has(c.iso)) {
                map.set(c.iso, { iso: c.iso, name: c.name, count: 0, _sum: 0, _rated: 0, films: [] });
            }
            const rec = map.get(c.iso);
            rec.count++;
            rec.films.push(m);
            const r = Number(m.rating);
            if (m.rating != null && !Number.isNaN(r)) { rec._sum += r; rec._rated++; }
        });
    });
    map.forEach(rec => {
        rec.avg = rec._rated ? rec._sum / rec._rated : null;
        delete rec._sum; delete rec._rated;
    });
    return map;
}
