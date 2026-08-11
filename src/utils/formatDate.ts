/**
 * Formats a date string or Date object into DD-MM-YYYY format.
 * Correctly handles ISO timestamps from Supabase (e.g., "2026-08-01T06:25:15.161Z"),
 * YYYY-MM-DD strings, Date objects, and custom date formats.
 */
export const formatDateToDDMMYYYY = (
  dateValue: string | Date | null | undefined,
  separator: string = "-"
): string => {
  if (!dateValue) return "";

  try {
    let dateObj: Date | null = null;

    if (dateValue instanceof Date) {
      dateObj = dateValue;
    } else if (typeof dateValue === "string") {
      const trimmed = dateValue.trim();
      if (!trimmed) return "";

      // Handle "Date(2026, 7, 1)" style string
      if (trimmed.startsWith("Date(")) {
        const parts = trimmed
          .substring(5, trimmed.length - 1)
          .split(",")
          .map((p) => parseInt(p.trim(), 10));
        if (parts.length >= 3) {
          dateObj = new Date(parts[0], parts[1], parts[2]);
        }
      } 
      // Handle YYYY-MM-DD or ISO string "2026-08-01T06:25:15..."
      else if (trimmed.includes("-")) {
        // Extract the YYYY-MM-DD portion before 'T' or space
        const cleanDateStr = trimmed.split("T")[0].split(" ")[0];
        const parts = cleanDateStr.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
          const [year, month, day] = parts;
          return `${day.padStart(2, "0")}${separator}${month.padStart(2, "0")}${separator}${year}`;
        }
      }
      // Handle DD/MM/YYYY or YYYY/MM/DD
      else if (trimmed.includes("/")) {
        const parts = trimmed.split("/");
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            const [year, month, day] = parts;
            return `${day.padStart(2, "0")}${separator}${month.padStart(2, "0")}${separator}${year}`;
          }
          const [day, month, year] = parts;
          return `${day.padStart(2, "0")}${separator}${month.padStart(2, "0")}${separator}${year}`;
        }
      }

      if (!dateObj) {
        dateObj = new Date(trimmed);
      }
    }

    if (dateObj && !isNaN(dateObj.getTime())) {
      const day = dateObj.getDate().toString().padStart(2, "0");
      const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
      const year = dateObj.getFullYear();
      return `${day}${separator}${month}${separator}${year}`;
    }

    return String(dateValue);
  } catch (error) {
    console.error("Error formatting date:", error);
    return String(dateValue);
  }
};

export default formatDateToDDMMYYYY;
