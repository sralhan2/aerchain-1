import rfxJson from "./rfx-data.json";

export type RfxLine = {
  id: string;
  category: "Laptop" | "Monitor" | "Docking Station" | "Peripheral" | "Warranty" | "Networking" | "Audio/Video" | "Power" | "Storage" | "Software" | "Accessory";
  description: string;
  spec: string;
  qty: number;
  unit: string;
};

export const RFX = rfxJson as {
  title: string;
  buyerOrg: string;
  currency: string;
  issuedDate: string;
  dueDate: string;
  deliveryWindow: string;
  deliveryLocation: string;
  scope: string;
  questionnaire: { q: string }[];
  lines: RfxLine[];
};
