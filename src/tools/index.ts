import { cancelOrder } from "./cancel-order.js";
import { checkAvailability } from "./check-availability.js";
import { getItem } from "./get-item.js";
import { getOrderStatus } from "./get-order-status.js";
import { listLocations } from "./list-locations.js";
import { placeOrder } from "./place-order.js";
import { planGroupOrder } from "./plan-group-order.js";
import { quoteOrder } from "./quote-order.js";
import { searchMenu } from "./search-menu.js";

export const tools = [
  listLocations,
  searchMenu,
  getItem,
  checkAvailability,
  planGroupOrder,
  quoteOrder,
  placeOrder,
  getOrderStatus,
  cancelOrder,
] as const;
