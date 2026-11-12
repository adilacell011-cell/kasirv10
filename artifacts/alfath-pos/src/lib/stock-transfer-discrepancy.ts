export type TransferQuantitySnapshot = {
  status: string;
  dispatchedQty: number | null;
  receivedQty: number | null;
};

export function getUnresolvedTransferDiscrepancyQty(
  transfer: TransferQuantitySnapshot,
): number {
  const { dispatchedQty, receivedQty } = transfer;
  if (
    transfer.status !== "RECEIVED" ||
    !Number.isSafeInteger(dispatchedQty) ||
    !Number.isSafeInteger(receivedQty) ||
    dispatchedQty === null ||
    receivedQty === null
  ) {
    return 0;
  }

  return Math.max(0, dispatchedQty - receivedQty);
}
