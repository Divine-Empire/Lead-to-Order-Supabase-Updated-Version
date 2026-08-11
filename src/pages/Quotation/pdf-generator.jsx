import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  pdf,
  Font,
} from "@react-pdf/renderer";
import logo from "../../assests/WhatsApp Image 2025-05-14 at 4.11.43 PM.jpeg";
import qr from "../../assests/qrlogo.png";
import maniquipLogo1 from "../../assests/maniquip-logo-screenshot.png";

// Register custom Google Font that contains the Indian Rupee symbol (₹) using stable CDNJS assets
Font.register({
  family: "Roboto",
  fonts: [
    { src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf" },
    { src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf", fontWeight: "bold" },
    { src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf", fontStyle: "italic" },
  ],
});

// Function to convert number to words for Indian Rupees
const numberToWords = (num) => {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const convertHundreds = (n) => {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100)
      return (
        tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "")
      );
    if (n < 1000)
      return (
        ones[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 !== 0 ? " " + convertHundreds(n % 100) : "")
      );
    if (n < 100000)
      return (
        convertHundreds(Math.floor(n / 1000)) +
        " Thousand" +
        (n % 1000 !== 0 ? " " + convertHundreds(n % 1000) : "")
      );
    if (n < 10000000)
      return (
        convertHundreds(Math.floor(n / 100000)) +
        " Lakh" +
        (n % 100000 !== 0 ? " " + convertHundreds(n % 100000) : "")
      );
    return (
      convertHundreds(Math.floor(n / 10000000)) +
      " Crore" +
      (n % 10000000 !== 0 ? " " + convertHundreds(n % 10000000) : "")
    );
  };

  if (num === 0) return "Zero";

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  let result = "";
  if (rupees > 0) {
    result += convertHundreds(rupees) + " Rupees";
  }
  if (paise > 0) {
    if (rupees > 0) result += " and ";
    result += convertHundreds(paise) + " Paise";
  }

  return result + " Only";
};

// Formatting helper
const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(value || 0)
    .replace("₹", "")
    .trim();
};

// Helper to force line wrapping on long continuous strings in react-pdf.
// wordBreak: "break-all" on the cell style handles most wrapping, but
// @react-pdf/renderer's default hyphenation splits a word at any existing
// hyphen (e.g. "MOULD-150X150X150MM" -> "MOULD-" + "150X150X150MM") without
// re-checking whether that remainder still fits the column, letting it
// overflow past the cell's right edge. A zero-width space after the hyphen
// doesn't fix this (the engine still mismeasures the fit), so instead we
// force a real line break after a hyphen when the following run of
// non-space characters is long enough to risk overflowing a table cell.
const wrapLongWords = (val) => {
  if (!val) return " ";
  return String(val).replace(/-(\S{11,})/g, "-\n$1");
};

// React-PDF Stylesheet using Roboto for full Indian Rupee Symbol support
const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 40,
    paddingLeft: 20,
    paddingRight: 20,
    backgroundColor: "#ffffff",
    fontFamily: "Roboto",
    fontSize: 9.5,
    lineHeight: 1.45,
    color: "#000000",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    borderBottomStyle: "solid",
  },
  headerLogoLeft: {
    width: 50,
    height: 50,
  },
  headerLogoRight: {
    width: 120,
    height: 50,
  },
  headerCenter: {
    textAlign: "center",
    flex: 1,
  },
  companyName: {
    fontSize: 18,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#4338CA",
    textAlign: "center",
  },
  companySubtitle: {
    fontSize: 14,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#4338CA",
    textAlign: "center",
    marginTop: 8,
  },
  boxContainer: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  titleSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    borderBottomStyle: "solid",
  },
  titleText: {
    fontSize: 18,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#000000",
  },
  metaTextRight: {
    textAlign: "right",
  },
  detailsSection: {
    flexDirection: "row",
    marginBottom: 15,
  },
  detailsColumn: {
    width: "50%",
    paddingRight: 10,
  },
  detailsTitle: {
    fontSize: 10.5,
    fontFamily: "Roboto",
    fontWeight: "bold",
    marginBottom: 4,
    color: "#000000",
  },
  detailsText: {
    fontSize: 8.5,
    fontFamily: "Roboto",
    lineHeight: 1.45,
  },
  billShipSection: {
    flexDirection: "row",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    borderBottomStyle: "solid",
  },
  table: {
    width: "100%",
    borderLeftWidth: 1,
    borderLeftColor: "#cccccc",
    borderLeftStyle: "solid",
    borderRightWidth: 1,
    borderRightColor: "#cccccc",
    borderRightStyle: "solid",
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    borderBottomStyle: "solid",
    marginTop: 10,
    marginBottom: 15,
    position: "relative",
  },
  tableTopBorderLine: {
    height: 1,
    backgroundColor: "#cccccc",
    width: "100%",
    position: "absolute",
    top: -2.5,
    left: 0,
    zIndex: 10,
  },
  tableBottomBorderLine: {
    height: 1,
    backgroundColor: "#cccccc",
    width: "100%",
    position: "absolute",
    bottom: 0,
    left: 0,
    zIndex: 10,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    borderBottomStyle: "solid",
    alignItems: "stretch",
    minHeight: 18,
  },
  tableRowHeader: {
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 2,
    borderBottomColor: "#cccccc",
    borderBottomStyle: "solid",
  },
  tableCell: {
    paddingTop: 5,
    paddingBottom: 6,
    paddingLeft: 3.5,
    paddingRight: 3.5,
    fontSize: 8.5,
    fontFamily: "Roboto",
    justifyContent: "flex-start",
    borderRightWidth: 1,
    borderRightColor: "#cccccc",
    borderRightStyle: "solid",
    flexShrink: 0,
  },
  tableCellText: {
    fontSize: 8.5,
    fontFamily: "Roboto",
    wordBreak: "break-all",
  },
  tableCellHeaderText: {
    fontFamily: "Roboto",
    fontWeight: "bold",
    fontSize: 8.5,
  },
  twoColSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  twoColLeft: {
    width: "48%",
  },
  twoColRight: {
    width: "48%",
  },
  twoColFull: {
    width: "100%",
  },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: "Roboto",
    fontWeight: "bold",
    marginBottom: 4,
    color: "#000000",
  },
  taxTable: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cccccc",
    borderStyle: "solid",
  },
  taxRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    borderBottomStyle: "solid",
    alignItems: "center",
    minHeight: 16,
  },
  taxRowHeader: {
    backgroundColor: "#f8f9fa",
  },
  taxCell: {
    padding: "3px 4px",
    fontSize: 7.5,
    fontFamily: "Roboto",
    borderRightWidth: 1,
    borderRightColor: "#dddddd",
    borderRightStyle: "solid",
  },
  taxCellHeader: {
    fontFamily: "Roboto",
    fontWeight: "bold",
    fontSize: 7.5,
  },
  amountWordsBox: {
    marginTop: 4,
  },
  amountWordsLabel: {
    fontSize: 9.5,
    fontFamily: "Roboto",
    fontWeight: "bold",
    marginBottom: 2,
  },
  amountWordsText: {
    fontSize: 8.5,
    fontFamily: "Roboto",
    textTransform: "capitalize",
  },
  grandTotalTextRight: {
    textAlign: "right",
    marginTop: 10,
  },
  grandTotalLarge: {
    fontSize: 13,
    fontFamily: "Roboto",
    fontWeight: "bold",
  },
  termsSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
    borderTopStyle: "solid",
    paddingTop: 10,
  },
  termRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  termLabel: {
    width: 120,
    fontSize: 8.5,
    fontFamily: "Roboto",
    fontWeight: "bold",
  },
  termValue: {
    flex: 1,
    fontSize: 8.5,
    fontFamily: "Roboto",
  },
  specialOffersContainer: {
    marginTop: 10,
    backgroundColor: "#fff3e0",
    borderWidth: 1,
    borderColor: "#ffcc80",
    borderStyle: "solid",
    padding: 6,
    borderRadius: 4,
  },
  specialOffersTitle: {
    fontSize: 9.5,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#e65100",
    marginBottom: 4,
  },
  specialOfferText: {
    fontSize: 8.5,
    fontFamily: "Roboto",
    marginBottom: 2,
  },
  notesContainer: {
    marginTop: 10,
  },
  noteText: {
    fontSize: 8.5,
    fontFamily: "Roboto",
    marginBottom: 2,
  },
  bankQrSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
    borderTopStyle: "solid",
    paddingTop: 10,
  },
  qrBox: {
    borderWidth: 1,
    borderColor: "#cccccc",
    borderStyle: "solid",
    borderRadius: 8,
    width: 130,
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  qrImage: {
    width: 100,
    height: 100,
    marginTop: 8,
    marginBottom: 8,
  },
  qrFooter: {
    backgroundColor: "#f8f9fa",
    borderTopWidth: 1,
    borderTopColor: "#cccccc",
    borderTopStyle: "solid",
    width: "100%",
    padding: 4,
    textAlign: "center",
  },
  qrText: {
    fontSize: 8.5,
    fontFamily: "Roboto",
    fontWeight: "bold",
  },
  declarationSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
    borderTopStyle: "solid",
    paddingTop: 10,
    alignItems: "flex-end",
  },
  declarationTitle: {
    fontSize: 9.5,
    fontFamily: "Roboto",
    fontWeight: "bold",
    marginBottom: 4,
  },
  declarationText: {
    fontSize: 8.5,
    fontFamily: "Roboto",
    textAlign: "right",
    maxWidth: "80%",
    lineHeight: 1.45,
  },
  declarationPrepared: {
    fontSize: 8.5,
    fontFamily: "Roboto",
    marginTop: 8,
    marginBottom: 8,
  },
  declarationNote: {
    fontSize: 7.5,
    fontFamily: "Roboto",
    fontStyle: "italic",
    color: "#666666",
  },
  pageNumber: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    fontSize: 8,
    fontFamily: "Roboto",
    textAlign: "center",
    color: "#999999",
  },
});

const colStyles = {
  "S No.": { width: "3%", textAlign: "left" },
  "Code": { width: "8%", textAlign: "left" },
  "Product Name": { width: "14%", textAlign: "left" },
  "Description": { width: "28%", textAlign: "left" },
  "GST %": { width: "4.5%", textAlign: "left" },
  "Qty": { width: "3.5%", textAlign: "left" },
  "Units": { width: "4%", textAlign: "left" },
  "Rate": { width: "11%", textAlign: "left" },
  "Disc %": { width: "3.5%", textAlign: "left" },
  "Flat Disc": { width: "9.5%", textAlign: "left" },
  "Amount": { width: "11%", textAlign: "left" },
};

// React PDF Document Component
const QuotationPDFDocument = ({
  quotationData = {},
  selectedReferences = [],
  specialDiscount = 0,
  hiddenColumns = {},
  hiddenFields = {},
}) => {
  const displayedQuotationNo =
    (quotationData &&
      (quotationData.quotation_no || quotationData.Quotation_No || quotationData.finalQuotationNo)) ||
    quotationData?.quotationNo ||
    "NBD-002";

  // Financial calculations
  const subtotal = quotationData.subtotal || 0;
  const totalFlatDiscount = quotationData.totalFlatDiscount || 0;

  // Use the breakdown objects directly for calculations
  const cgstAmount = quotationData.cgstAmount || 0;
  const sgstAmount = quotationData.sgstAmount || 0;
  const igstAmount = quotationData.igstAmount || 0;
  const totalTax = quotationData.isIGST ? igstAmount : cgstAmount + sgstAmount;
  const grandTotal = Math.max(
    0,
    Number((subtotal + totalTax - (specialDiscount || 0)).toFixed(2))
  );

  const dateStr = (() => {
    if (!quotationData.date) {
      return new Date().toLocaleDateString("en-GB");
    }

    if (
      typeof quotationData.date === "string" &&
      quotationData.date.includes("/")
    ) {
      const [day, month, year] = quotationData.date.split("/");
      return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
    }

    try {
      return new Date(quotationData.date).toLocaleDateString("en-GB");
    } catch {
      return new Date().toLocaleDateString("en-GB");
    }
  })();

  // Dynamically push visible columns
  const tableHeaders = ["S No."];
  if (!hiddenColumns?.hideCode) tableHeaders.push("Code");
  if (!hiddenColumns?.hideProductName) tableHeaders.push("Product Name");
  if (!hiddenColumns?.hideDescription) tableHeaders.push("Description");
  if (!hiddenColumns?.hideGST) tableHeaders.push("GST %");
  if (!hiddenColumns?.hideQty) tableHeaders.push("Qty");
  if (!hiddenColumns?.hideUnits) tableHeaders.push("Units");
  if (!hiddenColumns?.hideRate) tableHeaders.push("Rate");
  if (!hiddenColumns?.hideDisc) tableHeaders.push("Disc %");
  if (!hiddenColumns?.hideFlatDisc) tableHeaders.push("Flat Disc");
  if (!hiddenColumns?.hideAmount) tableHeaders.push("Amount");

  const items = quotationData.items || [];

  // Calculate dynamic scaled column widths so the sum is always exactly 100%
  const totalBaseWidth = tableHeaders.reduce((sum, h) => {
    const widthStr = colStyles[h]?.width || "10%";
    return sum + parseFloat(widthStr);
  }, 0) || 100;

  const scaledColWidths = {};
  tableHeaders.forEach((header) => {
    const baseWidth = parseFloat(colStyles[header]?.width || "10%");
    const percentage = (baseWidth / totalBaseWidth) * 100;
    scaledColWidths[header] = `${percentage.toFixed(4)}%`;
  });

  // Summary Row sizing logic
  const lastHeader = tableHeaders[tableHeaders.length - 1]; // "Amount"
  const lastColStyle = colStyles[lastHeader] || { textAlign: "right" };
  const lastColWidthStr = scaledColWidths[lastHeader] || "10%";
  const lastColWidthVal = parseFloat(lastColWidthStr) || 10;
  const labelColWidth = `${100 - lastColWidthVal}%`;

  // Calculate dynamic font size based on the number of visible columns to optimize space and prevent wrapping
  let dynamicFontSize = 8.5;
  if (tableHeaders.length <= 6) {
    dynamicFontSize = 9.5;
  } else if (tableHeaders.length === 7 || tableHeaders.length === 8) {
    dynamicFontSize = 8.5;
  } else if (tableHeaders.length === 9) {
    dynamicFontSize = 7.8;
  } else {
    dynamicFontSize = 7.0; // 10 or 11 columns
  }

  // Calculate dynamic word break thresholds based on column counts
  const codeMaxChars = tableHeaders.length <= 6 ? 16 : (tableHeaders.length >= 9 ? 8 : 10);
  const nameMaxChars = tableHeaders.length <= 6 ? 24 : (tableHeaders.length >= 9 ? 12 : 16);
  const descMaxChars = tableHeaders.length <= 6 ? 20 : (tableHeaders.length >= 9 ? 12 : 16);

  const showTaxBreakdown =
    (quotationData.isIGST && !hiddenColumns?.hideIGST) ||
    (!quotationData.isIGST &&
      !hiddenColumns?.hideCGST &&
      !hiddenColumns?.hideSGST);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header Section (remains outside the box) */}
        <View style={styles.header}>
          <Image src={logo} style={styles.headerLogoLeft} />
          <View style={styles.headerCenter}>
            <Text style={styles.companyName}>DIVINE EMPIRE INDIA</Text>
            <Text style={styles.companySubtitle}>( PVT. LTD. )</Text>
          </View>
          <Image src={maniquipLogo1} style={styles.headerLogoRight} />
        </View>

        {/* Box enclosing the Quotation contents */}
        <View style={styles.boxContainer}>
          {/* Title and Metadata */}
          <View style={styles.titleSection}>
            <Text style={styles.titleText}>QUOTATION</Text>
            <View style={styles.metaTextRight}>
              <Text style={{ fontFamily: "Roboto", fontWeight: "bold", fontSize: 9 }}>
                Quo No: {displayedQuotationNo}
              </Text>
              <Text style={{ fontFamily: "Roboto", fontSize: 9 }}>
                Date: {dateStr}
              </Text>
            </View>
          </View>

          {/* Details Section */}
          <View style={styles.detailsSection} wrap={false}>
            <View style={styles.detailsColumn}>
              <Text style={styles.detailsTitle}>Consignor Details</Text>
              <Text style={styles.detailsText}>
                DIVINE EMPIRE INDIA( PVT. LTD. )
              </Text>
              {selectedReferences && selectedReferences.length > 0 && (
                <Text style={styles.detailsText}>{selectedReferences.join(", ")}</Text>
              )}
              <Text style={styles.detailsText}>{quotationData.consignorAddress || " "}</Text>
              <Text style={styles.detailsText}>
                Mobile: {quotationData.consignorMobile || " "}
              </Text>
              <Text style={styles.detailsText}>
                Phone: 0772-400515
              </Text>
              <Text style={styles.detailsText}>
                GSTIN: {quotationData.consignorGSTIN || " "}
              </Text>
              <Text style={styles.detailsText}>
                State Code: {quotationData.consignorStateCode || " "}
              </Text>
              <Text style={styles.detailsText}>
                MSME Number: {quotationData.msmeNumber || " "}
              </Text>
            </View>

            <View style={styles.detailsColumn}>
              <Text style={styles.detailsTitle}>Consignee Details</Text>
              <Text style={styles.detailsText}>
                Company Name: {quotationData.consigneeName || " "}
              </Text>
              <Text style={styles.detailsText}>
                Contact Name: {quotationData.consigneeContactName || " "}
              </Text>
              <Text style={styles.detailsText}>
                Contact No.: {quotationData.consigneeContactNo || " "}
              </Text>
              <Text style={styles.detailsText}>
                State: {quotationData.consigneeState || " "}
              </Text>
              <Text style={styles.detailsText}>
                GSTIN: {quotationData.consigneeGSTIN || " "}
              </Text>
              <Text style={styles.detailsText}>
                State Code: {quotationData.consigneeStateCode || " "}
              </Text>
            </View>
          </View>

          {/* Bill To & Ship To */}
          <View style={styles.billShipSection} wrap={false}>
            <View style={styles.detailsColumn}>
              <Text style={styles.detailsTitle}>Bill To</Text>
              <Text style={styles.detailsText}>{quotationData.consigneeAddress || " "}</Text>
            </View>
            <View style={styles.detailsColumn}>
              <Text style={styles.detailsTitle}>Ship To</Text>
              <Text style={styles.detailsText}>{quotationData.shipTo || " "}</Text>
            </View>
          </View>

          {/* Items Table */}
          <View style={styles.table}>
            <View style={styles.tableTopBorderLine} fixed />
            <View style={styles.tableBottomBorderLine} fixed />
            {/* Header Row */}
            <View style={[styles.tableRow, styles.tableRowHeader]} wrap={false}>
              {tableHeaders.map((header, idx) => (
                <View
                  key={header}
                  style={[
                    styles.tableCell,
                    {
                      width: scaledColWidths[header],
                      flexGrow: colStyles[header].flexGrow,
                    },
                    idx === tableHeaders.length - 1 ? { borderRightWidth: 0 } : {},
                  ]}
                >
                  <Text
                    style={[
                      styles.tableCellHeaderText,
                      { textAlign: colStyles[header].textAlign, fontSize: dynamicFontSize },
                    ]}
                  >
                    {header}
                  </Text>
                </View>
              ))}
            </View>

            {/* Data Rows */}
            {items.map((item, index) => (
              <View key={index} style={styles.tableRow} minPresenceAhead={40}>
                {tableHeaders.map((header, idx) => {
                  let cellContent = "";
                  if (header === "S No.") cellContent = index + 1;
                  else if (header === "Code") cellContent = wrapLongWords(item.code || " ", codeMaxChars);
                  else if (header === "Product Name") cellContent = wrapLongWords(item.name || " ", nameMaxChars);
                  else if (header === "Description") cellContent = wrapLongWords(item.description || " ", descMaxChars);
                  else if (header === "GST %") cellContent = `${item.gst || 18}%`;
                  else if (header === "Qty") cellContent = Number(item.qty) || 1;
                  else if (header === "Units") cellContent = item.units || "Nos";
                  else if (header === "Rate") cellContent = `₹${formatCurrency(item.rate || 0)}`;
                  else if (header === "Disc %") cellContent = `${item.discount || 0}%`;
                  else if (header === "Flat Disc") cellContent = `₹${formatCurrency(item.flatDiscount || 0)}`;
                  else if (header === "Amount") cellContent = `₹${formatCurrency(item.amount || 0)}`;

                  return (
                    <View
                      key={header}
                      style={[
                        styles.tableCell,
                        {
                          width: scaledColWidths[header],
                          flexGrow: colStyles[header].flexGrow,
                        },
                        idx === tableHeaders.length - 1 ? { borderRightWidth: 0 } : {},
                      ]}
                    >
                      <Text
                        style={[
                          styles.tableCellText,
                          { textAlign: colStyles[header].textAlign, fontSize: dynamicFontSize },
                        ]}
                      >
                        {cellContent}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}

            {/* Empty fallback row */}
            {items.length === 0 && (
              <View style={styles.tableRow} wrap={false}>
                {tableHeaders.map((header, idx) => {
                  let cellContent = "";
                  if (header === "S No.") cellContent = "1";
                  else if (header === "Code") cellContent = " ";
                  else if (header === "Product Name") cellContent = " ";
                  else if (header === "Description") cellContent = " ";
                  else if (header === "GST %") cellContent = "18%";
                  else if (header === "Qty") cellContent = "1";
                  else if (header === "Units") cellContent = "Nos";
                  else if (header === "Rate") cellContent = "₹0.00";
                  else if (header === "Disc %") cellContent = "0%";
                  else if (header === "Flat Disc") cellContent = "₹0.00";
                  else if (header === "Amount") cellContent = "₹0.00";

                  return (
                    <View
                      key={header}
                      style={[
                        styles.tableCell,
                        {
                          width: scaledColWidths[header],
                          flexGrow: colStyles[header].flexGrow,
                        },
                        idx === tableHeaders.length - 1 ? { borderRightWidth: 0 } : {},
                      ]}
                    >
                      <Text
                        style={[
                          styles.tableCellText,
                          { textAlign: colStyles[header].textAlign, fontSize: dynamicFontSize },
                        ]}
                      >
                        {cellContent}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Subtotal */}
            {!hiddenColumns?.hideSubtotal && (
              <View style={styles.tableRow} wrap={false}>
                <View style={[styles.tableCell, { width: labelColWidth }]}>
                  <Text style={[styles.tableCellHeaderText, { textAlign: "right", fontSize: dynamicFontSize }]}>
                    Subtotal
                  </Text>
                </View>
                <View style={[styles.tableCell, { width: lastColWidthStr, borderRightWidth: 0 }]}>
                  <Text
                    style={[
                      styles.tableCellHeaderText,
                      { textAlign: lastColStyle.textAlign, fontSize: dynamicFontSize },
                    ]}
                  >
                    ₹{formatCurrency(subtotal)}
                  </Text>
                </View>
              </View>
            )}

            {/* Total Qty */}
            {!hiddenColumns?.hideTotalQty && (
              <View style={styles.tableRow} wrap={false}>
                <View style={[styles.tableCell, { width: labelColWidth }]}>
                  <Text style={[styles.tableCellText, { textAlign: "right", fontSize: dynamicFontSize }]}>Total Qty</Text>
                </View>
                <View style={[styles.tableCell, { width: lastColWidthStr, borderRightWidth: 0 }]}>
                  <Text
                    style={[
                      styles.tableCellText,
                      { textAlign: lastColStyle.textAlign, fontSize: dynamicFontSize },
                    ]}
                  >
                    {items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)}
                  </Text>
                </View>
              </View>
            )}

            {/* Total Flat Discount */}
            {!hiddenColumns.hideTotalFlatDisc && totalFlatDiscount > 0 && (
              <View style={styles.tableRow} wrap={false}>
                <View style={[styles.tableCell, { width: labelColWidth }]}>
                  <Text style={[styles.tableCellText, { textAlign: "right", fontSize: dynamicFontSize }]}>
                    Total Flat Discount
                  </Text>
                </View>
                <View style={[styles.tableCell, { width: lastColWidthStr, borderRightWidth: 0 }]}>
                  <Text
                    style={[
                      styles.tableCellText,
                      { textAlign: lastColStyle.textAlign, fontSize: dynamicFontSize },
                    ]}
                  >
                    -₹{formatCurrency(totalFlatDiscount)}
                  </Text>
                </View>
              </View>
            )}

            {/* Special Discount */}
            {!hiddenColumns.hideSpecialDiscount && Number(specialDiscount) > 0 && (
              <View style={styles.tableRow} wrap={false}>
                <View style={[styles.tableCell, { width: labelColWidth }]}>
                  <Text style={[styles.tableCellText, { textAlign: "right", fontSize: dynamicFontSize }]}>
                    Special Discount
                  </Text>
                </View>
                <View style={[styles.tableCell, { width: lastColWidthStr, borderRightWidth: 0 }]}>
                  <Text
                    style={[
                      styles.tableCellText,
                      { textAlign: lastColStyle.textAlign, fontSize: dynamicFontSize },
                    ]}
                  >
                    ₹{formatCurrency(Number(specialDiscount) || 0)}
                  </Text>
                </View>
              </View>
            )}

            {/* Grand Total */}
            {!hiddenColumns?.hideGrandTotal && (
              <View style={[styles.tableRow, { backgroundColor: "#EEF2FF" }]} wrap={false}>
                <View style={[styles.tableCell, { width: labelColWidth }]}>
                  <Text style={[styles.tableCellHeaderText, { textAlign: "right", fontSize: dynamicFontSize }]}>
                    Grand Total
                  </Text>
                </View>
                <View style={[styles.tableCell, { width: lastColWidthStr, borderRightWidth: 0 }]}>
                  <Text
                    style={[
                      styles.tableCellHeaderText,
                      { textAlign: lastColStyle.textAlign, fontSize: dynamicFontSize },
                    ]}
                  >
                    ₹{formatCurrency(grandTotal)}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Tax Breakdown & Amount in Words */}
          <View style={styles.twoColSection} wrap={false}>
            {showTaxBreakdown ? (
              <>
                <View style={styles.twoColLeft}>
                  <Text style={styles.sectionTitle}>Tax Breakdown</Text>
                  <View style={styles.taxTable}>
                    <View style={[styles.taxRow, styles.taxRowHeader]}>
                      <View style={[styles.taxCell, { width: "40%" }]}>
                        <Text style={styles.taxCellHeader}>Tax Type</Text>
                      </View>
                      <View style={[styles.taxCell, { width: "25%" }]}>
                        <Text style={styles.taxCellHeader}>Rate</Text>
                      </View>
                      <View style={[styles.taxCell, { width: "35%", textAlign: "right", borderRightWidth: 0 }]}>
                        <Text style={styles.taxCellHeader}>Amount</Text>
                      </View>
                    </View>

                    {/* IGST breakdown */}
                    {quotationData.isIGST && !hiddenColumns?.hideIGST && (
                      <>
                        {Object.entries(quotationData.igstBreakdown || {}).map(
                          ([rate, value]) => (
                            <View key={`igst-${rate}`} style={styles.taxRow}>
                              <View style={[styles.taxCell, { width: "40%" }]}>
                                <Text>IGST</Text>
                              </View>
                              <View style={[styles.taxCell, { width: "25%" }]}>
                                <Text>{Number(rate)}%</Text>
                              </View>
                              <View
                                style={[
                                  styles.taxCell,
                                  { width: "35%", textAlign: "right", borderRightWidth: 0 },
                                ]}
                              >
                                <Text>₹{formatCurrency(Number(value))}</Text>
                              </View>
                            </View>
                          )
                        )}
                        <View style={[styles.taxRow, { backgroundColor: "#f8f9fa" }]}>
                          <View style={[styles.taxCell, { width: "40%" }]}>
                            <Text style={styles.taxCellHeader}>IGST Total</Text>
                          </View>
                          <View style={[styles.taxCell, { width: "25%" }]}>
                            <Text style={styles.taxCellHeader}>
                              {quotationData.igstRate || 18}%
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.taxCell,
                              { width: "35%", textAlign: "right", borderRightWidth: 0 },
                            ]}
                          >
                            <Text style={styles.taxCellHeader}>
                              ₹{formatCurrency(igstAmount)}
                            </Text>
                          </View>
                        </View>
                      </>
                    )}

                    {/* CGST & SGST breakdowns */}
                    {!quotationData.isIGST && (
                      <>
                        {!hiddenColumns?.hideCGST && (
                          <>
                            {Object.entries(quotationData.cgstBreakdown || {}).map(
                              ([rate, value]) => (
                                <View key={`cgst-${rate}`} style={styles.taxRow}>
                                  <View style={[styles.taxCell, { width: "40%" }]}>
                                    <Text>CGST</Text>
                                  </View>
                                  <View style={[styles.taxCell, { width: "25%" }]}>
                                    <Text>{Number(rate)}%</Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.taxCell,
                                      { width: "35%", textAlign: "right", borderRightWidth: 0 },
                                    ]}
                                  >
                                    <Text>₹{formatCurrency(Number(value))}</Text>
                                  </View>
                                </View>
                              )
                            )}
                            <View
                              style={[
                                styles.taxRow,
                                { backgroundColor: "#f8f9fa" },
                              ]}
                            >
                              <View style={[styles.taxCell, { width: "40%" }]}>
                                <Text style={styles.taxCellHeader}>CGST Total</Text>
                              </View>
                              <View style={[styles.taxCell, { width: "25%" }]}>
                                <Text style={styles.taxCellHeader}>
                                  {quotationData.cgstRate || 9}%
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.taxCell,
                                  { width: "35%", textAlign: "right", borderRightWidth: 0 },
                                ]}
                              >
                                <Text style={styles.taxCellHeader}>
                                  ₹{formatCurrency(cgstAmount)}
                                </Text>
                              </View>
                            </View>
                          </>
                        )}

                        {!hiddenColumns?.hideSGST && (
                          <>
                            {Object.entries(quotationData.sgstBreakdown || {}).map(
                              ([rate, value]) => (
                                <View key={`sgst-${rate}`} style={styles.taxRow}>
                                  <View style={[styles.taxCell, { width: "40%" }]}>
                                    <Text>SGST</Text>
                                  </View>
                                  <View style={[styles.taxCell, { width: "25%" }]}>
                                    <Text>{Number(rate)}%</Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.taxCell,
                                      { width: "35%", textAlign: "right", borderRightWidth: 0 },
                                    ]}
                                  >
                                    <Text>₹{formatCurrency(Number(value))}</Text>
                                  </View>
                                </View>
                              )
                            )}
                            <View
                              style={[
                                styles.taxRow,
                                { backgroundColor: "#f8f9fa" },
                              ]}
                            >
                              <View style={[styles.taxCell, { width: "40%" }]}>
                                <Text style={styles.taxCellHeader}>SGST Total</Text>
                              </View>
                              <View style={[styles.taxCell, { width: "25%" }]}>
                                <Text style={styles.taxCellHeader}>
                                  {quotationData.sgstRate || 9}%
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.taxCell,
                                  { width: "35%", textAlign: "right", borderRightWidth: 0 },
                                ]}
                              >
                                <Text style={styles.taxCellHeader}>
                                  ₹{formatCurrency(sgstAmount)}
                                </Text>
                              </View>
                            </View>
                          </>
                        )}
                      </>
                    )}
                  </View>
                </View>

                <View style={styles.twoColRight}>
                  {!hiddenColumns?.hideGrandTotal && (
                    <View style={styles.amountWordsBox}>
                      <Text style={styles.amountWordsLabel}>
                        Amount Chargeable (in words)
                      </Text>
                      <Text style={styles.amountWordsText}>
                        {Number(grandTotal) > 0
                          ? numberToWords(grandTotal)
                          : "Zero"}{" "}
                        Only
                      </Text>
                      <View style={styles.grandTotalTextRight}>
                        <Text style={styles.grandTotalLarge}>
                          Grand Total: ₹{formatCurrency(grandTotal)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.twoColFull}>
                {!hiddenColumns?.hideGrandTotal && (
                  <View style={styles.amountWordsBox}>
                    <Text style={styles.amountWordsLabel}>
                      Amount Chargeable (in words)
                    </Text>
                    <Text style={styles.amountWordsText}>
                      {Number(grandTotal) > 0
                        ? numberToWords(grandTotal)
                        : "Zero"}{" "}
                      Only
                    </Text>
                    <View style={styles.grandTotalTextRight}>
                      <Text style={styles.grandTotalLarge}>
                        Grand Total: ₹{formatCurrency(grandTotal)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Terms & Conditions */}
          <View style={styles.termsSection}>
            <Text style={styles.sectionTitle}>Terms & Conditions</Text>
            {!hiddenFields?.validity && (
              <View style={styles.termRow} wrap={false}>
                <Text style={styles.termLabel}>Validity</Text>
                <Text style={styles.termValue}>
                  {quotationData.validity ||
                    "The above quoted prices are valid up to 10 days from date of offer."}
                </Text>
              </View>
            )}
            {!hiddenFields?.paymentTerms && (
              <View style={styles.termRow} wrap={false}>
                <Text style={styles.termLabel}>Payment Terms</Text>
                <Text style={styles.termValue}>
                  {quotationData.paymentTerms ||
                    "100% advance payment in the mode of NEFT, RTGS & DD. Payment only accepted in company's account – DIVINE EMPIRE INDIA PVT LTD."}
                </Text>
              </View>
            )}
            {!hiddenFields?.delivery && (
              <View style={styles.termRow} wrap={false}>
                <Text style={styles.termLabel}>Delivery</Text>
                <Text style={styles.termValue}>
                  {quotationData.delivery ||
                    "Within 7-10 working days after received purchase order and 100% advance payment"}
                </Text>
              </View>
            )}
            {!hiddenFields?.freight && (
              <View style={styles.termRow} wrap={false}>
                <Text style={styles.termLabel}>Freight</Text>
                <Text style={styles.termValue}>
                  {quotationData.freight || "Extra as per actual."}
                </Text>
              </View>
            )}
            {!hiddenFields?.warranty && (
              <View style={styles.termRow} wrap={false}>
                <Text style={styles.termLabel}>Warranty</Text>
                <Text style={styles.termValue}>
                  {quotationData.warranty ||
                    "6 months warranty applicable against Manufacturing defects."}
                </Text>
              </View>
            )}
            {!hiddenFields?.taxes && (
              <View style={styles.termRow} wrap={false}>
                <Text style={styles.termLabel}>Taxes</Text>
                <Text style={styles.termValue}>
                  {quotationData.taxes || "Extra mentioned in the quotation."}
                </Text>
              </View>
            )}
            {!hiddenFields?.insurance && (
              <View style={styles.termRow} wrap={false}>
                <Text style={styles.termLabel}>Insurance</Text>
                <Text style={styles.termValue}>
                  {quotationData.insurance ||
                    "Transit insurance for all shipment is at Buyer's scope."}
                </Text>
              </View>
            )}
            {!hiddenFields?.afterReceiptOfMaterial && (
              <View style={styles.termRow} wrap={false}>
                <Text style={styles.termLabel}>After Receipt of Material</Text>
                <Text style={styles.termValue}>
                  {quotationData.afterReceiptOfMaterial ||
                    "In case of any discrepancy in the material, please inform us within 24 hours with supporting images attached. After this period, the company will not be responsible for any discrepancies."}
                </Text>
              </View>
            )}
            {!hiddenFields?.technicalSupport && (
              <View style={styles.termRow} wrap={false}>
                <Text style={styles.termLabel}>Technical Support</Text>
                <Text style={styles.termValue}>
                  {quotationData.technicalSupport ||
                    "Video call assistance for installation and troubleshooting of the machine is FOC. For physical assistance: Service charges are free during the warranty period; however, TA & DA will be charged extra as per actuals."}
                </Text>
              </View>
            )}
          </View>

          {/* Special Anniversary Offers */}
          {quotationData.specialOffers &&
            quotationData.specialOffers.filter((offer) => offer.trim()).length > 0 && (
              <View style={styles.specialOffersContainer} wrap={false}>
                <Text style={styles.specialOffersTitle}>
                  Divine Empire's 10th Anniversary Special Offer
                </Text>
                {quotationData.specialOffers
                  .filter((offer) => offer.trim())
                  .map((offer, index) => (
                    <Text key={index} style={styles.specialOfferText}>
                      • {offer}
                    </Text>
                  ))}
              </View>
            )}

          {/* Notes Section */}
          {quotationData.notes &&
            quotationData.notes.filter((note) => note.trim()).length > 0 && (
              <View style={styles.notesContainer} wrap={false}>
                <Text style={styles.sectionTitle}>Notes</Text>
                {quotationData.notes
                  .filter((note) => note.trim())
                  .map((note, index) => (
                    <Text key={index} style={styles.noteText}>
                      {index + 1}. {note}
                    </Text>
                  ))}
              </View>
            )}

          {/* Bank Details and QR Code */}
          <View style={styles.bankQrSection} wrap={false}>
            <View style={styles.twoColLeft}>
              <Text style={styles.sectionTitle}>Bank Details</Text>
              <Text style={styles.detailsText}>
                DIVINE EMPIRE INDIA PVT LTD.
              </Text>
              <Text style={styles.detailsText}>
                Account No.: {quotationData.accountNo || " "}
              </Text>
              <Text style={styles.detailsText}>
                Bank Name: {quotationData.bankName || " "}
              </Text>
              <Text style={styles.detailsText}>
                Bank Address: {quotationData.bankAddress || " "}
              </Text>
              <Text style={styles.detailsText}>
                IFSC CODE: {quotationData.ifscCode || " "}
              </Text>
              <Text style={styles.detailsText}>
                Email: {quotationData.email || " "}
              </Text>
              <Text style={styles.detailsText}>
                Website: {quotationData.website || " "}
              </Text>
              <Text style={styles.detailsText}>
                Company PAN: {quotationData.pan || " "}
              </Text>
            </View>
            <View style={{ width: "48%", alignItems: "flex-end" }}>
              <View style={styles.qrBox}>
                <Image src={qr} style={styles.qrImage} />
                <View style={styles.qrFooter}>
                  <Text style={styles.qrText}>Scan for Payment</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Declaration */}
          <View style={styles.declarationSection} wrap={false}>
            <Text style={styles.declarationTitle}>Declaration:</Text>
            <Text style={styles.declarationText}>
              We declare that this Quotation shows the actual price of the goods
              described and that all particulars are true and correct.
            </Text>
            <Text style={styles.declarationPrepared}>
              Prepared By: {quotationData.preparedBy || " "}
            </Text>
            <Text style={styles.declarationNote}>
              This Quotation is computer-generated and does not require a seal or
              signature.
            </Text>
          </View>
        </View>

        {/* Footer Page Number */}
        <Text style={styles.pageNumber} fixed>
          Page
        </Text>
      </Page>
    </Document>
  );
};

// Client-side only PDF generation using @react-pdf/renderer
export const generatePDFFromData = async (
  quotationData,
  selectedReferences,
  specialDiscount,
  hiddenColumns = {},
  hiddenFields = {}
) => {
  if (typeof window === "undefined") {
    throw new Error(
      "PDF generation is only available in the browser environment. Please run this function on the client side."
    );
  }

  try {
    console.log("Starting PDF generation with @react-pdf/renderer...");

    const doc = (
      <QuotationPDFDocument
        quotationData={quotationData}
        selectedReferences={selectedReferences}
        specialDiscount={specialDiscount}
        hiddenColumns={hiddenColumns}
        hiddenFields={hiddenFields}
      />
    );

    // Render document to blob
    const blob = await pdf(doc).toBlob();

    // Convert blob to Data URI (base64)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result);
      };
      reader.onerror = (error) => {
        reject(
          new Error("Failed to convert PDF blob to data URI: " + error.message)
        );
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error generating PDF with @react-pdf/renderer:", error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

// Alternative function that returns base64 directly
export const generatePDFBase64 = async (
  quotationData,
  selectedReferences,
  specialDiscount,
  hiddenColumns = {},
  hiddenFields = {}
) => {
  try {
    const pdfDataUri = await generatePDFFromData(
      quotationData,
      selectedReferences,
      specialDiscount,
      hiddenColumns,
      hiddenFields
    );
    const base64Data = pdfDataUri.split(",")[1];
    return base64Data;
  } catch (error) {
    console.error("Error generating PDF base64:", error);
    throw error;
  }
};

// Export the component and document names (maintaining exports for backwards-compatibility)
export { QuotationPDFDocument, QuotationPDFDocument as QuotationPDFComponent };
