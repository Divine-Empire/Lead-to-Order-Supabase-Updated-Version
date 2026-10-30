// "Created By" / "Time" printed in the bottom-right corner of the quotation
// PDFs. Taken from whoever is logged in when the PDF is generated and the
// moment of generation -- they exist only in the PDF and are never saved to
// lto_make_quotations.
export function getPdfGeneratedBy() {
  let createdBy = "";
  try {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");
    createdBy = user?.fullName || user?.username || "";
  } catch {
    // unreadable storage: leave the name blank
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return {
    createdBy,
    time: `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`,
  };
}
