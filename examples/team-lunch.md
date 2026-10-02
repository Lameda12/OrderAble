# Team lunch for 12, planned and ordered by an agent

A real transcript: an agent connected to Orderable (mock adapter, Crumb & Co + Northline Coffee in Halifax) orders lunch for 12 people with 3 vegetarians and 1 gluten-free person, under $20 a head, delivered.

The agent narration is scripted. **Every tool call and result below is real output** from the server, regenerated with `npx tsx scripts/team-lunch.ts > examples/team-lunch.md`. The clock is pinned to Wednesday 7 October 2026, 10:00 ADT. Some long fields are trimmed for readability (noted inline).

**Customer:** Order lunch for the team tomorrow at noon. 12 people: 3 vegetarians, 1 gluten-free. Keep it under $20 a head, delivered to 1801 Hollis St.

**Agent:** Finding places that deliver to B3J.

<details><summary><code>list_locations</code></summary>

```json
// → list_locations
{
  "postal_code": "B3J 3N4",
  "fulfillment": "delivery"
}
```

```json
// ← result (trimmed)
{
  "locations": [
    {
      "id": "northline-barrington",
      "name": "Northline Coffee Barrington",
      "open_now": true,
      "hours_today": "07:00-18:00",
      "delivers_to_you": "yes",
      "delivery_fee": {
        "amount": 499,
        "currency": "CAD"
      }
    },
    {
      "id": "crumb-quinpool",
      "name": "Crumb & Co Quinpool",
      "open_now": true,
      "hours_today": "07:00-18:00",
      "delivers_to_you": "unknown",
      "delivery_fee": {
        "amount": 599,
        "currency": "CAD"
      }
    }
  ],
  "as_of": "2026-10-07T13:00:00.000Z",
  "ttl_seconds": 300
}
```

</details>

**Agent:** Northline Coffee Barrington delivers there. Planning a cart for 12 that covers every diet.

<details open><summary><code>plan_group_order</code></summary>

```json
// → plan_group_order
{
  "location_id": "northline-barrington",
  "headcount": 12,
  "budget_per_person": 2000,
  "dietary_requirements": {
    "vegetarian": 3,
    "gluten_free": 1
  },
  "desired_time": "2026-10-08T15:00:00.000Z",
  "fulfillment": "delivery"
}
```

```json
// ← result (trimmed)
{
  "location_id": "northline-barrington",
  "location_name": "Northline Coffee Barrington",
  "headcount": 12,
  "desired_time": "2026-10-08T15:00:00.000Z",
  "ready_time": "2026-10-08T14:35:00.000Z",
  "fulfillment": "delivery",
  "line_details": [
    {
      "item_id": "nl-harvest-bowl",
      "name": "Harvest Grain Bowl",
      "quantity": 4,
      "serves": 1,
      "covers": [
        "gluten_free x1",
        "general x3"
      ],
      "unit_price": {
        "amount": 1350,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 5400,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-falafel-wrap",
      "name": "Falafel Wrap",
      "quantity": 2,
      "serves": 1,
      "covers": [
        "vegetarian x2"
      ],
      "unit_price": {
        "amount": 1150,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 2300,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-caprese-panini",
      "name": "Caprese Panini",
      "quantity": 1,
      "serves": 1,
      "covers": [
        "vegetarian x1"
      ],
      "unit_price": {
        "amount": 1195,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 1195,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-turkey-club",
      "name": "Turkey Club",
      "quantity": 3,
      "serves": 1,
      "covers": [
        "general x3"
      ],
      "unit_price": {
        "amount": 1295,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 3885,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-chicken-caesar-wrap",
      "name": "Chicken Caesar Wrap",
      "quantity": 2,
      "serves": 1,
      "covers": [
        "general x2"
      ],
      "unit_price": {
        "amount": 1250,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 2500,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-sparkling-lemonade",
      "name": "Sparkling Lemonade",
      "quantity": 12,
      "serves": 1,
      "covers": [
        "drinks x12"
      ],
      "unit_price": {
        "amount": 350,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 4200,
        "currency": "CAD"
      }
    }
  ],
  "estimate": {
    "subtotal": {
      "amount": 19480,
      "currency": "CAD"
    },
    "fees": [
      {
        "code": "delivery",
        "label": "Delivery fee",
        "amount": {
          "amount": 499,
          "currency": "CAD"
        }
      }
    ],
    "tax": {
      "amount": 2797,
      "currency": "CAD"
    },
    "total": {
      "amount": 22776,
      "currency": "CAD"
    },
    "budget_total": {
      "amount": 24000,
      "currency": "CAD"
    },
    "per_person": {
      "amount": 1898,
      "currency": "CAD"
    },
    "within_budget": true
  },
  "coverage": {
    "people_with_a_main": 12,
    "headcount": 12,
    "dietary": [
      {
        "requirement": "gluten_free",
        "needed": 1,
        "covered": 1,
        "items": [
          "Harvest Grain Bowl"
        ]
      },
      {
        "requirement": "vegetarian",
        "needed": 3,
        "covered": 3,
        "items": [
          "Falafel Wrap",
          "Caprese Panini"
        ]
      }
    ],
    "fully_covered": true
  },
  "unmet": [],
  "warnings": [],
  "as_of": "2026-10-07T13:00:00.000Z",
  "ttl_seconds": 300,
  "next_step": "Review with the customer, then call quote_order with `lines` exactly as given (add delivery_address for delivery)."
}
```

</details>

**Agent:** Everyone's covered. Locking in a price.

<details open><summary><code>quote_order</code></summary>

```json
// → quote_order
{
  "location_id": "northline-barrington",
  "lines": [
    {
      "item_id": "nl-harvest-bowl",
      "quantity": 4,
      "modifiers": []
    },
    {
      "item_id": "nl-falafel-wrap",
      "quantity": 2,
      "modifiers": []
    },
    {
      "item_id": "nl-caprese-panini",
      "quantity": 1,
      "modifiers": []
    },
    {
      "item_id": "nl-turkey-club",
      "quantity": 3,
      "modifiers": []
    },
    {
      "item_id": "nl-chicken-caesar-wrap",
      "quantity": 2,
      "modifiers": []
    },
    {
      "item_id": "nl-sparkling-lemonade",
      "quantity": 12,
      "modifiers": []
    }
  ],
  "fulfillment": "delivery",
  "desired_time": "2026-10-08T15:00:00.000Z",
  "delivery_address": {
    "line1": "1801 Hollis St",
    "city": "Halifax",
    "region": "NS",
    "postal_code": "B3J 3N4",
    "country": "CA",
    "lat": 44.6488,
    "lng": -63.5752
  },
  "headcount": 12
}
```

```json
// ← result (trimmed)
{
  "quote_id": "q_f9220a59ff20",
  "location_id": "northline-barrington",
  "fulfillment": "delivery",
  "desired_time": "2026-10-08T15:00:00.000Z",
  "eta": "2026-10-08T15:00:00.000Z",
  "delivery_address": {
    "line1": "1801 Hollis St",
    "city": "Halifax",
    "region": "NS",
    "postal_code": "B3J 3N4",
    "country": "CA",
    "lat": 44.6488,
    "lng": -63.5752
  },
  "headcount": 12,
  "subtotal": {
    "amount": 19480,
    "currency": "CAD"
  },
  "fees": [
    {
      "code": "delivery",
      "label": "Delivery fee",
      "amount": {
        "amount": 499,
        "currency": "CAD"
      }
    }
  ],
  "tax": {
    "amount": 2797,
    "currency": "CAD"
  },
  "total": {
    "amount": 22776,
    "currency": "CAD"
  },
  "expires_at": "2026-10-07T13:10:00.000Z",
  "policy": {
    "allowed": true,
    "violations": []
  },
  "warnings": [
    "DRY_RUN is on: orders will be recorded but not sent to the merchant."
  ],
  "as_of": "2026-10-07T13:00:00.000Z",
  "ttl_seconds": 600,
  "next_step": "Show the customer the total ($227.76), then call place_order with quote_id, a fresh idempotency_key, contact details and confirm: true before 2026-10-07T13:10:00.000Z.",
  "lines": [
    {
      "item_id": "nl-harvest-bowl",
      "name": "Harvest Grain Bowl",
      "quantity": 4,
      "unit_price": {
        "amount": 1350,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 5400,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-falafel-wrap",
      "name": "Falafel Wrap",
      "quantity": 2,
      "unit_price": {
        "amount": 1150,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 2300,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-caprese-panini",
      "name": "Caprese Panini",
      "quantity": 1,
      "unit_price": {
        "amount": 1195,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 1195,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-turkey-club",
      "name": "Turkey Club",
      "quantity": 3,
      "unit_price": {
        "amount": 1295,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 3885,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-chicken-caesar-wrap",
      "name": "Chicken Caesar Wrap",
      "quantity": 2,
      "unit_price": {
        "amount": 1250,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 2500,
        "currency": "CAD"
      }
    },
    {
      "item_id": "nl-sparkling-lemonade",
      "name": "Sparkling Lemonade",
      "quantity": 12,
      "unit_price": {
        "amount": 350,
        "currency": "CAD"
      },
      "line_total": {
        "amount": 4200,
        "currency": "CAD"
      }
    }
  ]
}
```

</details>

**Agent:** 4 Harvest Grain Bowl, 2 Falafel Wrap, 1 Caprese Panini, 3 Turkey Club, 2 Chicken Caesar Wrap, 12 Sparkling Lemonade. Total $227.76 with tax and delivery, $18.98 a head. Place it?

**Customer:** Yes. Put it on the Harbourline account.

<details><summary><code>place_order</code></summary>

```json
// → place_order
{
  "quote_id": "q_f9220a59ff20",
  "idempotency_key": "fecf7303-0c07-42f8-853c-709e5d796de3",
  "customer": {
    "name": "Priya Shah",
    "email": "priya@harbourline.example",
    "company": "Harbourline Labs"
  },
  "confirm": true,
  "payment_method": "invoice"
}
```

```json
// ← result (trimmed)
{
  "order": {
    "order_id": "ord_d6386eefbc3d",
    "quote_id": "q_f9220a59ff20",
    "location_id": "northline-barrington",
    "status": "received",
    "fulfillment": "delivery",
    "eta": "2026-10-08T15:00:00.000Z",
    "subtotal": {
      "amount": 19480,
      "currency": "CAD"
    },
    "fees": [
      {
        "code": "delivery",
        "label": "Delivery fee",
        "amount": {
          "amount": 499,
          "currency": "CAD"
        }
      }
    ],
    "tax": {
      "amount": 2797,
      "currency": "CAD"
    },
    "total": {
      "amount": 22776,
      "currency": "CAD"
    },
    "customer": {
      "name": "Priya Shah",
      "email": "priya@harbourline.example",
      "company": "Harbourline Labs"
    },
    "delivery_address": {
      "line1": "1801 Hollis St",
      "city": "Halifax",
      "region": "NS",
      "postal_code": "B3J 3N4",
      "country": "CA",
      "lat": 44.6488,
      "lng": -63.5752
    },
    "payment": {
      "method": "invoice",
      "instructions": "Billed to the customer's account, Net 30. An invoice for $227.76 is emailed after fulfillment."
    },
    "dry_run": true,
    "created_at": "2026-10-07T13:00:00.000Z",
    "cancellable_until": "2026-10-08T14:00:00.000Z",
    "timeline": [
      {
        "status": "received",
        "at": "2026-10-07T13:00:00.000Z",
        "note": "DRY_RUN: recorded only, not sent to the merchant"
      }
    ]
  },
  "idempotent_replay": false,
  "next_step": "Order ord_d6386eefbc3d is recorded (DRY_RUN, not sent to the merchant). Tell the customer: Billed to the customer's account, Net 30. An invoice for $227.76 is emailed after fulfillment. Track with get_order_status."
}
```

</details>

**Agent:** The connection dropped before I saw the confirmation. Retrying with the same idempotency key.

<details><summary><code>place_order</code></summary>

```json
// → place_order
{
  "quote_id": "q_f9220a59ff20",
  "idempotency_key": "fecf7303-0c07-42f8-853c-709e5d796de3",
  "customer": {
    "name": "Priya Shah",
    "email": "priya@harbourline.example",
    "company": "Harbourline Labs"
  },
  "confirm": true,
  "payment_method": "invoice"
}
```

```json
// ← result (trimmed)
{
  "order": {
    "order_id": "ord_d6386eefbc3d",
    "quote_id": "q_f9220a59ff20",
    "location_id": "northline-barrington",
    "status": "received",
    "fulfillment": "delivery",
    "eta": "2026-10-08T15:00:00.000Z",
    "subtotal": {
      "amount": 19480,
      "currency": "CAD"
    },
    "fees": [
      {
        "code": "delivery",
        "label": "Delivery fee",
        "amount": {
          "amount": 499,
          "currency": "CAD"
        }
      }
    ],
    "tax": {
      "amount": 2797,
      "currency": "CAD"
    },
    "total": {
      "amount": 22776,
      "currency": "CAD"
    },
    "customer": {
      "name": "Priya Shah",
      "email": "priya@harbourline.example",
      "company": "Harbourline Labs"
    },
    "delivery_address": {
      "line1": "1801 Hollis St",
      "city": "Halifax",
      "region": "NS",
      "postal_code": "B3J 3N4",
      "country": "CA",
      "lat": 44.6488,
      "lng": -63.5752
    },
    "payment": {
      "method": "invoice",
      "instructions": "Billed to the customer's account, Net 30. An invoice for $227.76 is emailed after fulfillment."
    },
    "dry_run": true,
    "created_at": "2026-10-07T13:00:00.000Z",
    "cancellable_until": "2026-10-08T14:00:00.000Z",
    "timeline": [
      {
        "status": "received",
        "at": "2026-10-07T13:00:00.000Z",
        "note": "DRY_RUN: recorded only, not sent to the merchant"
      }
    ]
  },
  "idempotent_replay": true,
  "next_step": "This is the original order (safe retry). Call get_order_status to track it."
}
```

</details>

**Agent:** Same order back, no duplicate. Checking status.

<details><summary><code>get_order_status</code></summary>

```json
// → get_order_status
{
  "order_id": "ord_d6386eefbc3d"
}
```

```json
// ← result
{
  "order_id": "ord_d6386eefbc3d",
  "status": "received",
  "eta": "2026-10-08T15:00:00.000Z",
  "dry_run": true,
  "timeline": [
    {
      "status": "received",
      "at": "2026-10-07T13:00:00.000Z",
      "note": "DRY_RUN: recorded only, not sent to the merchant"
    }
  ],
  "cancellable_until": "2026-10-08T14:00:00.000Z",
  "total": {
    "amount": 22776,
    "currency": "CAD"
  },
  "as_of": "2026-10-07T13:00:00.000Z",
  "ttl_seconds": 60,
  "next_step": "DRY_RUN order: it will stay 'received' because it was never sent to the merchant."
}
```

</details>

**Agent:** Done. Order ord_d6386eefbc3d arrives Thursday at 12:00. Billed to Harbourline, Net 30. (DRY_RUN is on, so this was recorded but not sent to the kitchen.)

## What to notice

- **The budget is all-in.** `plan_group_order` backs out 14% HST and the $4.99 delivery fee before choosing food, then only adds drinks because they still fit.
- **Diets are covered with real tags, not guesses.** The gluten-free person gets the Harvest Grain Bowl, which carries the `gluten_free` tag. The vegetarians are split across two options.
- **The quote locks the price for 10 minutes.** `place_order` re-checks stock, prices and the spending policy before accepting it.
- **The retry is safe.** Same `idempotency_key` returns the original order with `idempotent_replay: true`. Nobody gets 24 sandwiches.
- **DRY_RUN is on by default.** The order is recorded with a note that it was not sent to the kitchen, until the owner flips `dry_run: false`.
- **No card data.** Payment is an invoice on the company account.

