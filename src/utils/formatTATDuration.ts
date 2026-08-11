/**
 * Converts days and an "HH:MM" string into total minutes.
 * e.g., days = 1, hhmm = "02:30" => 1*1440 + 2*60 + 30 = 1590 minutes
 */
export const daysAndTimeToMinutes = (days: number, hhmm: string): number => {
  const safeDays = Math.max(0, Number(days) || 0);
  let hours = 0;
  let minutes = 0;

  if (hhmm && typeof hhmm === "string") {
    const parts = hhmm.split(":");
    if (parts.length >= 2) {
      hours = Math.max(0, parseInt(parts[0], 10) || 0);
      minutes = Math.max(0, parseInt(parts[1], 10) || 0);
    }
  }

  return safeDays * 1440 + hours * 60 + minutes;
};

/**
 * Converts total minutes into days and an "HH:MM" string for form editing.
 * e.g., 1590 minutes => { days: 1, hhmm: "02:30" }
 */
export const minutesToDaysAndHHMM = (totalMinutes: number): { days: number; hhmm: string } => {
  const safeMins = Math.max(0, Number(totalMinutes) || 0);
  const days = Math.floor(safeMins / 1440);
  const remMinutes = safeMins % 1440;
  const hours = Math.floor(remMinutes / 60);
  const mins = remMinutes % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");

  return {
    days,
    hhmm: `${hh}:${mm}`
  };
};

/**
 * Converts total minutes into "HH:MM:SS" format.
 * e.g., 1590 minutes => 26 hours, 30 mins => "26:30:00"
 */
export const minutesToHHMMSS = (totalMinutes: number): string => {
  const safeMins = Math.max(0, Number(totalMinutes) || 0);
  const hours = Math.floor(safeMins / 60);
  const mins = safeMins % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");

  return `${hh}:${mm}:00`;
};

/**
 * Converts total minutes into a clean display string.
 * e.g., 1590 minutes => "1 day 2 hrs 30 mins"
 */
export const minutesToDisplayLabel = (totalMinutes: number): string => {
  const safeMins = Math.max(0, Number(totalMinutes) || 0);
  if (safeMins === 0) return "0 mins";

  const days = Math.floor(safeMins / 1440);
  const remMinutes = safeMins % 1440;
  const hours = Math.floor(remMinutes / 60);
  const mins = remMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hr${hours > 1 ? "s" : ""}`);
  if (mins > 0 || (days === 0 && hours === 0)) parts.push(`${mins} min${mins > 1 ? "s" : ""}`);

  return parts.join(" ");
};
