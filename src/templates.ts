import type { BusinessType } from "./schema.js";

export interface InitAnswers {
  type: BusinessType;
  name: string;
  id: string;
  line1: string;
  city: string;
  region: string;
  postal_code: string;
  timezone: string;
  tax_rate: number;
}

const fsa = (a: InitAnswers) => a.postal_code.replace(/\s+/g, "").slice(0, 3).toUpperCase() || "B3J";

const header = (a: InitAnswers) => `# ${a.name}: menu for Orderable
# Edit this file, then run \`orderable validate\` and \`orderable doctor\`.
# Prices are in dollars. Hours are 24h "HH:MM-HH:MM" or "closed".
# Allergens: list what an item CONTAINS and what it MAY CONTAIN (shared equipment).
# Anything you don't list is reported to agents as "unknown", never as safe.
# Allergen names: gluten, wheat, milk, egg, peanut, tree_nut, sesame, soy, fish, shellfish, mustard, sulphites
# Dietary tags: vegetarian, vegan, gluten_free, dairy_free, nut_free, halal, kosher

business:
  id: ${a.id}
  name: "${a.name.replace(/"/g, '\\"')}"
  type: ${a.type}
  currency: CAD
  policies:
    cancellation:
      free_within_minutes: 5          # anyone can cancel this soon after ordering
      until_minutes_before_ready: 120 # after that, until this long before pickup/delivery
    refund: Full refund for cancellations inside the window.
    payment: Pay at pickup, or on account for business customers.

locations:
  - id: ${a.id}-main
    name: "${a.name.replace(/"/g, '\\"')}"
    address:
      line1: "${a.line1}"
      city: "${a.city}"
      region: ${a.region}
      postal_code: "${a.postal_code}"
      country: CA
    timezone: ${a.timezone}
    tax_rate: ${a.tax_rate}             # percent
    prep_minutes: 15`;

const footer = `
# When did you last update stock? Use "live" if a system keeps it current,
# or a timestamp. Agents drop merchants whose availability goes stale.
stock_updated_at: live
stock_ttl_seconds: 900
`;

const bakery = (a: InitAnswers) => `${header(a)}
    hours:
      mon: closed
      tue: "07:00-18:00"
      wed: "07:00-18:00"
      thu: "07:00-18:00"
      fri: "07:00-18:00"
      sat: "08:00-16:00"
      sun: "08:00-14:00"
    fulfillment: [pickup, delivery, catering]
    delivery:
      postal_codes: [${fsa(a)}]   # first 3 characters of postal codes you deliver to (or radius_km + lat/lng on the address)
      fee: 5.99
      minimum: 30

categories:
  - { id: pastries, name: Pastries }
  - { id: breads, name: Breads }
  - { id: cakes, name: Celebration Cakes }
  - { id: catering, name: Catering }

items:
  - id: butter-croissant
    name: Butter Croissant
    description: Flaky, all-butter, baked every morning.
    category: pastries
    price: 3.75
    dietary: [vegetarian]
    allergens:
      contains: [wheat, gluten, milk, egg]
      may_contain: [tree_nut]
    stock: { status: in_stock, quantity: 36 }

  # A daily sell-out item: set the quantity each morning so agents never promise one you don't have.
  - id: morning-bun
    name: Cardamom Morning Bun
    description: Baked once at 7am. When they're gone, they're gone.
    category: pastries
    price: 4.50
    dietary: [vegetarian]
    allergens:
      contains: [wheat, gluten, milk, egg]
    stock: { status: low, quantity: 6 }

  - id: sourdough
    name: Country Sourdough
    description: Naturally leavened. Flour, water, salt.
    category: breads
    price: 9.00
    dietary: [vegan, vegetarian, dairy_free]
    allergens:
      contains: [wheat, gluten]
    stock: in_stock

  # Lead-time cakes: agents will refuse to promise one sooner than this.
  - id: chocolate-cake
    name: Chocolate Celebration Cake (8 in)
    description: Dark chocolate, salted caramel, ganache. Inscription included.
    category: cakes
    price: 58.00
    serves: 12
    lead_time: 48h
    dietary: [vegetarian]
    allergens:
      contains: [wheat, gluten, milk, egg, soy]
      may_contain: [tree_nut, peanut]
    modifiers:
      - id: inscription
        name: Inscription
        min: 0
        max: 1
        options:
          - { id: happy-birthday, name: Happy Birthday }
          - { id: custom, name: Custom message (add in notes) }
    stock: in_stock

  - id: pastry-box
    name: Morning Pastry Box (serves 12)
    description: A dozen assorted croissants and danishes for the office.
    category: catering
    price: 48.00
    serves: 12
    lead_time: 2h
    role: dessert
    dietary: [vegetarian]
    allergens:
      contains: [wheat, gluten, milk, egg]
      may_contain: [tree_nut]
    stock: in_stock
${footer}`;

const size = `
      - id: size
        name: Size
        min: 1
        max: 1
        options:
          - { id: small, name: Small 12oz }
          - { id: medium, name: Medium 16oz, price: 0.75 }
          - { id: large, name: Large 20oz, price: 1.25 }`;
const milk = `
      - id: milk
        name: Milk
        min: 1
        max: 1
        options:
          - { id: whole, name: Whole }
          - { id: oat, name: Oat, price: 0.75 }
          - { id: almond, name: Almond, price: 0.75 }`;

const cafe = (a: InitAnswers) => `${header(a)}
    hours:
      mon: "07:00-17:00"
      tue: "07:00-17:00"
      wed: "07:00-17:00"
      thu: "07:00-17:00"
      fri: "07:00-17:00"
      sat: "08:00-16:00"
      sun: "08:00-16:00"
    fulfillment: [pickup, delivery, dine_in]
    delivery:
      postal_codes: [B3H, B3J, B3K]   # first 3 characters of postal codes you deliver to
      fee: 4.99
      minimum: 25

categories:
  - { id: coffee, name: Coffee }
  - { id: lunch, name: Lunch }
  - { id: bakery, name: Bakery }

items:
  # Drink modifiers: min 1 / max 1 means "pick exactly one". Agents must choose before ordering.
  - id: latte
    name: Latte
    description: Double espresso and steamed milk.
    category: coffee
    price: 5.25
    dietary: [vegetarian, gluten_free]
    allergens:
      contains: [milk]
    modifiers:${size}${milk}
      - id: syrup
        name: Syrup
        min: 0
        max: 2
        options:
          - { id: vanilla, name: Vanilla, price: 0.75 }
          - { id: caramel, name: Caramel, price: 0.75 }
    stock: in_stock

  - id: americano
    name: Americano
    description: Double espresso topped with hot water.
    category: coffee
    price: 3.75
    dietary: [vegan, vegetarian, gluten_free, dairy_free]
    allergens:
      may_contain: [milk]   # shared espresso bar
    modifiers:${size}
    stock: in_stock

  - id: grain-bowl
    name: Harvest Grain Bowl
    description: Wild rice, roasted beets, chickpeas, greens, maple-tahini dressing.
    category: lunch
    price: 13.50
    role: main
    dietary: [vegan, vegetarian, gluten_free, dairy_free]
    allergens:
      contains: [sesame]
    stock: { status: in_stock, quantity: 12 }

  - id: turkey-club
    name: Turkey Club
    description: Roast turkey, bacon, tomato, lettuce, aioli on toasted multigrain.
    category: lunch
    price: 12.95
    role: main
    allergens:
      contains: [wheat, gluten, egg, mustard]
    stock: { status: in_stock, quantity: 15 }

  - id: blueberry-muffin
    name: Blueberry Muffin
    description: Wild Nova Scotia blueberries, crumb top.
    category: bakery
    price: 3.95
    dietary: [vegetarian]
    allergens:
      contains: [wheat, gluten, milk, egg]
    stock: in_stock
${footer}`;

const restaurant = (a: InitAnswers) => `${header(a)}
    hours:
      mon: closed
      tue: "11:30-21:00"
      wed: "11:30-21:00"
      thu: "11:30-21:00"
      fri: "11:30-22:00"
      sat: "11:30-22:00"
      sun: "11:30-20:00"
    fulfillment: [pickup, delivery, dine_in, catering]
    delivery:
      postal_codes: [${fsa(a)}]
      fee: 5.99
      minimum: 35

categories:
  - { id: mains, name: Mains }
  - { id: sides, name: Sides }
  - { id: catering, name: Catering Trays }

items:
  - id: fish-and-chips
    name: Haddock & Chips
    description: Beer-battered local haddock, hand-cut fries, tartar sauce.
    category: mains
    price: 19.00
    role: main
    allergens:
      contains: [fish, wheat, gluten]
      may_contain: [milk, egg]
    stock: in_stock

  - id: veggie-curry
    name: Chickpea Coconut Curry
    description: Mild coconut curry with chickpeas and spinach over basmati rice.
    category: mains
    price: 17.00
    role: main
    dietary: [vegan, vegetarian, gluten_free, dairy_free]
    allergens:
      may_contain: [tree_nut]
    stock: in_stock

  - id: fries
    name: Hand-cut Fries
    description: Twice-fried PEI potatoes.
    category: sides
    price: 6.00
    role: side
    dietary: [vegan, vegetarian, dairy_free]
    allergens:
      may_contain: [wheat, gluten, fish]   # shared fryer
    stock: in_stock

  # Catering trays: "serves" tells agents how many people one tray feeds.
  - id: curry-tray
    name: Curry Tray (serves 10)
    description: Chickpea coconut curry, rice and naan-free sides for ten.
    category: catering
    price: 150.00
    role: main
    serves: 10
    lead_time: 24h
    only_for: [catering, delivery, pickup]
    dietary: [vegan, vegetarian, gluten_free, dairy_free]
    allergens:
      may_contain: [tree_nut]
    stock: in_stock

  - id: sandwich-tray
    name: Sandwich Tray (serves 12)
    description: 24 half sandwiches, labelled by filling.
    category: catering
    price: 140.00
    role: main
    serves: 12
    lead_time: 24h
    only_for: [catering, delivery, pickup]
    allergens:
      contains: [wheat, gluten, milk, egg, mustard]
    stock: in_stock
${footer}`;

const delivery = (a: InitAnswers) => `${header(a)}
    hours:
      mon: "10:00-20:00"
      tue: "10:00-20:00"
      wed: "10:00-20:00"
      thu: "10:00-20:00"
      fri: "10:00-21:00"
      sat: "10:00-21:00"
      sun: "12:00-19:00"
    fulfillment: [delivery, catering]
    delivery:
      postal_codes: [B3H, B3J, B3K, B3L, B3M, B3N]
      fee: 3.99
      minimum: 20
      minutes: 35

categories:
  - { id: bowls, name: Bowls }
  - { id: drinks, name: Drinks }

items:
  - id: chicken-bowl
    name: Lemon Herb Chicken Bowl
    description: Grilled chicken, herbed rice, greens, feta, lemon dressing.
    category: bowls
    price: 15.50
    role: main
    dietary: [gluten_free]
    allergens:
      contains: [milk]
    stock: { status: in_stock, quantity: 40 }

  - id: tofu-bowl
    name: Sesame Tofu Bowl
    description: Crispy tofu, soba, edamame, slaw, sesame-soy glaze.
    category: bowls
    price: 14.50
    role: main
    dietary: [vegan, vegetarian, dairy_free]
    allergens:
      contains: [soy, sesame, wheat, gluten]
    stock: { status: in_stock, quantity: 30 }

  - id: lemonade
    name: Sparkling Lemonade
    description: Fresh lemon, cane sugar, soda.
    category: drinks
    price: 3.25
    dietary: [vegan, vegetarian, gluten_free, dairy_free]
    allergens:
      contains: [sulphites]
    stock: in_stock
${footer}`;

export function menuTemplate(a: InitAnswers): string {
  return { bakery, cafe, restaurant, delivery }[a.type](a);
}

export const configTemplate = (adapter: "file" | "mock" = "file") => `# Orderable server config. Restart \`orderable serve\` after editing.
adapter: ${adapter}            # file (menu.yaml) | mock (demo data) | square (v0.2)
menu: ./menu.yaml
database: ./orderable.db

# While true, orders are recorded but NOT sent to your kitchen. Flip to false when ready.
# The DRY_RUN env var overrides this.
dry_run: true

quote_ttl_seconds: 600   # quotes expire after 10 minutes

payment:
  methods: [pay_at_pickup, invoice]   # pay_at_pickup | invoice | payment_link
  # payment_link_template: https://pay.example.com/checkout/{order_id}
  invoice_terms: Net 30

# Limits on what agents can order. Dollars, tax included.
policy:
  timezone: America/Halifax
  max_order_total: 500
  max_daily_total: 2000
  max_headcount: 60
  allowed_location_ids: []   # empty = all locations

http:
  port: 3333
  host: 127.0.0.1
`;
