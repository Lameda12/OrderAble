import { z } from "zod";
import { FulfillmentMode, Freshness, IsoDateTime, Location } from "../schema.js";
import { defineTool, nextStep } from "./define.js";

export const listLocations = defineTool({
  name: "list_locations",
  title: "List locations",
  description: `Start here. Lists the merchant's locations with address, hours, fulfillment modes (pickup, delivery, dine_in, catering), and whether each is open right now.
Pass \`near\` (lat/lng) to sort by distance, and/or \`postal_code\` to learn whether each location delivers there (delivers_to_you: yes | no | unknown). With fulfillment="delivery", locations that definitely do not deliver to you are dropped.
Returns location ids. Next: call search_menu with a location_id.`,
  input: {
    near: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional().describe("Customer coordinates"),
    postal_code: z.string().optional().describe("Customer postal code, e.g. B3J 2K9"),
    fulfillment: FulfillmentMode.optional().describe("Only locations offering this mode"),
  },
  output: {
    locations: z.array(
      Location.extend({
        open_now: z.boolean(),
        hours_today: z.string(),
        next_open_at: IsoDateTime.nullable(),
        distance_km: z.number().nullable(),
        delivers_to_you: z.enum(["yes", "no", "unknown"]).nullable(),
      }),
    ),
    ...Freshness,
    ...nextStep,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (s, a) => s.listLocations(a),
});
