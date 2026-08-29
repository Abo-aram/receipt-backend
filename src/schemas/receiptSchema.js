import { Type } from "@google/genai";

export const receiptSchema = {
  type: Type.OBJECT,
  properties: {
    isReceipt: {
      type: Type.BOOLEAN,
      description:
        "True if the image contains a valid receipt, bill, or invoice; false if the image is not a receipt or is unreadable.",
    },
    errorMessage: {
      type: Type.STRING,
      description:
        "If isReceipt is false, a friendly explanation (e.g. 'No receipt detected in this image', 'The image is too blurry to read'). Null if isReceipt is true.",
    },
    merchantName: {
      type: Type.STRING,
      description: "The name of the store, restaurant, or business on the receipt.",
    },
    currency: {
      type: Type.STRING,
      description:
        "The exact currency symbol or currency code used on the receipt (e.g., $, €, £, ¥, ₹, IQD, USD, EUR, GBP, SAR, AED, TRY, etc.). Extract the actual currency displayed on the receipt.",
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Unique item ID (e.g. item_1, item_2)" },
          name: { type: Type.STRING, description: "Item description or name" },
          quantity: { type: Type.INTEGER, description: "Quantity of this item" },
          price: {
            type: Type.NUMBER,
            description: "Total price for this line item",
          },
        },
        required: ["id", "name", "price"],
      },
    },
    subtotal: { type: Type.NUMBER, description: "Subtotal before taxes/fees if listed" },
    tax: { type: Type.NUMBER, description: "Tax amount if listed" },
    tip: { type: Type.NUMBER, description: "Tip/gratuity amount if listed" },
    total: { type: Type.NUMBER, description: "Final grand total on the receipt" },
  },
  required: ["isReceipt", "items", "total"],
};

