import { customType } from "drizzle-orm/pg-core";

/**
 * Raw bytes. Used wherever the value is ciphertext and nothing else: biometric
 * centroids (ADR-016) and wrapped data keys (ADR-019). Never `text`, because
 * base64 would pay 33% on bytes that are already opaque.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
