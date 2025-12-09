import { ManageWebhooksSchema } from "./dist/schemas/webhooks.js";

console.log("Schema type:", ManageWebhooksSchema._def.typeName);
console.log("Has .shape:", ManageWebhooksSchema.shape !== undefined);

if (ManageWebhooksSchema.shape) {
  console.log("Shape keys:", Object.keys(ManageWebhooksSchema.shape));
  const operation = ManageWebhooksSchema.shape.operation;
  console.log("Operation type:", operation?._def?.typeName);
  console.log("Operation options count:", operation?._def?.options?.length);
}
