import { geoContains, geoNaturalEarth1 } from "d3-geo";
import type { FeatureCollection } from "geojson";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

export const MAP_W = 960;
export const MAP_H = 470;
const STEP = 9; // px between dots

// Fit the populated latitudes (Antarctica is skipped) into the frame.
const projection = geoNaturalEarth1().fitExtent(
  [
    [8, 8],
    [MAP_W - 8, MAP_H - 8],
  ],
  {
    type: "MultiPoint",
    coordinates: [
      [-180, 83],
      [0, 83],
      [180, 83],
      [-180, -57],
      [0, -57],
      [180, -57],
    ],
  },
);

let cached: [number, number][] | null = null;

/** Land dots on a regular screen-space grid. Computed once at build time. */
export function landDots(): [number, number][] {
  if (cached) return cached;
  const topo = land110 as unknown as Topology;
  const land = feature(topo, topo.objects.land!) as unknown as FeatureCollection;
  const dots: [number, number][] = [];
  for (let y = STEP / 2; y < MAP_H; y += STEP)
    for (let x = STEP / 2; x < MAP_W; x += STEP) {
      const ll = projection.invert?.([x, y]);
      if (ll && Number.isFinite(ll[0]) && ll[1] > -60 && land.features.some((f) => geoContains(f, ll))) dots.push([x, y]);
    }
  cached = dots;
  return dots;
}

export const project = (lng: number, lat: number) => projection([lng, lat]) as [number, number];
