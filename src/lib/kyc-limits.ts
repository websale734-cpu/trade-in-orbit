/** Upload limits for identity documents, shared by the KYC form and the server. */

/** Largest single file accepted. */
export const KYC_MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Largest combined size of all files in one submission. They are sent in a
 * single request, and Vercel rejects request bodies over 4.5 MB before they
 * reach the app, so this leaves headroom for the other form fields.
 */
export const KYC_MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/** Photos are scaled down in the browser so their longest side is at most this many pixels. */
export const KYC_MAX_IMAGE_EDGE = 2000;
