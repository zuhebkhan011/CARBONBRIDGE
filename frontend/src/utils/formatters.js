/**
 * Safely parse a value (number, numeric string, or Prisma Decimal representation) into a finite number.
 * Returns null if the value is missing, undefined, null, empty string, or not a finite number.
 * 
 * @param {unknown} val
 * @returns {number | null}
 */
export function parseSafeNumber(val) {
  if (val === null || val === undefined || val === '') {
    return null;
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof val === 'object') {
    if (typeof val.toNumber === 'function') {
      try {
        const num = val.toNumber();
        return Number.isFinite(num) ? num : null;
      } catch {
        return null;
      }
    }
    if (typeof val.toString === 'function' && val.toString !== Object.prototype.toString) {
      const num = Number(val.toString());
      return Number.isFinite(num) ? num : null;
    }
  }
  return null;
}

/**
 * Safely formats quantity with Tonnage (T) suffix.
 * Never outputs NaN, undefined, or [object Object].
 * 
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string} e.g. "100 T" or "—"
 */
export function formatQuantity(value, fallback = '—') {
  const num = parseSafeNumber(value);
  if (num === null) return fallback;
  return `${num.toLocaleString()} T`;
}

/**
 * Safely formats currency values in INR (₹).
 * Never outputs ₹NaN, undefined, or [object Object].
 * 
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string} e.g. "₹6,500" or "—"
 */
export function formatMoney(value, fallback = '—') {
  const num = parseSafeNumber(value);
  if (num === null) return fallback;
  return `₹${num.toLocaleString()}`;
}

/**
 * Safely formats percentage values (e.g. purity).
 * Never outputs NaN%, undefined%, or [object Object].
 * 
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string} e.g. "78%" or "78.5%" or "—"
 */
export function formatPercentage(value, fallback = '—') {
  const num = parseSafeNumber(value);
  if (num === null) return fallback;
  const formatted = Number.isInteger(num) ? `${num}%` : `${parseFloat(num.toFixed(2))}%`;
  return formatted;
}

// Backward-compatible aliases
export const formatTonnage = formatQuantity;
export const formatCurrency = formatMoney;
export const parsePurity = parseSafeNumber;
export const formatPurity = formatPercentage;

/**
 * Extract purity from any batch or listing object.
 * Checks both `purityPercentage` (the real backend Prisma field) and `purity` (frontend alias).
 * 
 * @param {any} item
 * @returns {number | null}
 */
export function getBatchPurity(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const target = item.batch || item;
  return parseSafeNumber(target.purityPercentage ?? target.purity ?? item.purityPercentage ?? item.purity);
}

/**
 * Safely format batch purity directly from a batch or listing object.
 * 
 * @param {any} item
 * @returns {string}
 */
export function formatBatchPurity(item) {
  return formatPercentage(getBatchPurity(item));
}

/**
 * Safely format a status string by replacing underscores with spaces.
 * Never throws TypeError on null/undefined/non-string values.
 * 
 * @param {unknown} status
 * @returns {string} Formatted label or "—" if missing.
 */
export function formatStatus(status) {
  if (typeof status !== 'string' || !status.trim()) {
    return '—';
  }
  return status.replace(/_/g, ' ');
}

/**
 * Safely extracts the shipment status from a shipment object,
 * checking `individualStatus` (real backend Prisma field) and `status` (frontend alias).
 * 
 * @param {any} shipment
 * @returns {string | null}
 */
export function getShipmentStatus(shipment) {
  if (!shipment || typeof shipment !== 'object') {
    return null;
  }
  const raw = shipment.individualStatus ?? shipment.status;
  return typeof raw === 'string' && raw.trim() ? raw : null;
}
