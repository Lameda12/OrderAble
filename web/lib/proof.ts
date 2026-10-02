/**
 * Real social proof only. The "What people say" section stays hidden until this list has entries.
 *
 * Every entry must be:
 * - a real person, quoted word for word from something they actually said or wrote
 * - linked to the original post (X, LinkedIn, blog) so visitors can check it
 * - shown with their permission (ask in a DM: "Mind if I put this on the site?")
 * - disclosed if they're an investor, friend, paid, or got something free (FTC/Competition Bureau rules)
 *
 * Example, once you have one:
 * {
 *   name: "Jane Doe",
 *   role: "Owner, Jane's Bakery",
 *   handle: "@janedoe",
 *   quote: "Set it up in 10 minutes. Two office orders came in through Claude the first week.",
 *   url: "https://x.com/janedoe/status/123",
 *   permission: true,
 * },
 */
export interface Endorsement {
  name: string;
  role: string;
  handle?: string;
  quote: string;
  url: string;
  permission: true;
  disclosure?: string;
}

export const ENDORSEMENTS: Endorsement[] = [];
