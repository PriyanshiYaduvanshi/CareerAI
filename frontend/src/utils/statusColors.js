// src/utils/statusColors.js
//
// Single source of truth for application-status colors, used by both
// Dashboard.js (recent applications preview) and ApplicationsPage.js
// (full applications list) so the same status always renders the same
// color everywhere in the app. These map onto the same brand palette
// defined in src/styles/global.css :root.
export const STATUS_COLORS = {
  applied: '#2563EB',   // var(--primary)
  screening: '#7C3AED', // var(--secondary)
  interview: '#059669', // var(--success)
  offer: '#D97706',     // var(--warning)
  rejected: '#DC2626',  // var(--danger)
  withdrawn: '#6B7280', // var(--text-secondary)
  saved: '#6B7280',     // var(--text-secondary)
};

export default STATUS_COLORS;
