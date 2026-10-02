/**
 * Business details shown in the footer and legal pages.
 * Fill in the [BRACKETED] values before relying on the legal pages.
 */
export const SITE = {
  name: "Orderable",
  url: "https://orderable-mcp.vercel.app",
  github: "https://github.com/Lameda12/OrderAble",
  legalName: "[LEGAL NAME OF OPERATOR]",
  contactEmail: "[CONTACT EMAIL]",
  privacyOfficer: "[NAME OF PERSON RESPONSIBLE FOR PERSONAL INFORMATION]",
  address: "[MAILING ADDRESS], Halifax, Nova Scotia, Canada",
  governingLaw: "the Province of Nova Scotia and the federal laws of Canada that apply there",
  lastUpdated: "October 2, 2026",
};

export const isPlaceholder = (v: string) => v.startsWith("[");
