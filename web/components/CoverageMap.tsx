import { mockCatalog } from "@/lib/orderable/adapters/mock";
import { MAP_H, MAP_W, landDots, project } from "@/lib/world-dots";

type City = { city: string; region: string; lng: number; lat: number; locations: { name: string; business: string }[] };

/** Cities with live demo locations, taken from the demo catalog itself, so the map can't overclaim. */
function liveCities(): City[] {
  const byCity = new Map<string, City>();
  for (const l of mockCatalog().locations) {
    if (l.address.lat == null || l.address.lng == null) continue;
    // Dartmouth sits across the harbour; at world scale it is the Halifax pin.
    const key = l.address.city === "Dartmouth" ? "Halifax" : l.address.city;
    const c = byCity.get(key) ?? { city: key, region: l.address.region, lng: l.address.lng, lat: l.address.lat, locations: [] };
    c.locations.push({ name: l.name, business: l.business_name });
    byCity.set(key, c);
  }
  return [...byCity.values()];
}

export function CoverageMap() {
  const dots = landDots();
  const cities = liveCities();
  return (
    <figure className="map">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-labelledby="map-title map-desc">
        <title id="map-title">Orderable coverage map</title>
        <desc id="map-desc">
          {`World map. Live demo locations: ${cities.map((c) => `${c.city}, ${c.region} (${c.locations.length})`).join("; ")}.`}
        </desc>
        <g className="map-land" aria-hidden>
          {dots.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} />
          ))}
        </g>
        {cities.map((c) => {
          const [x, y] = project(c.lng, c.lat);
          return (
            <g key={c.city} className="map-pin" tabIndex={0}>
              <title>{`${c.city}, ${c.region}: ${c.locations.map((l) => l.name).join(", ")}`}</title>
              <circle className="pulse" cx={x} cy={y} r={6} />
              <circle className="dot" cx={x} cy={y} r={5} />
              <text x={x + 12} y={y - 10}>
                {c.city}
              </text>
              <text className="sub" x={x + 12} y={y + 6}>
                {c.locations.length} locations
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span className="key">
          <i aria-hidden /> Live demo
        </span>
        {cities.map((c) => (
          <span key={c.city}>
            {c.city}, {c.region}: {[...new Set(c.locations.map((l) => l.business))].join(" and ")} ({c.locations.length} locations, fictional)
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
