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
  Link,
} from "@react-pdf/renderer";
import logo from "../../assests/WhatsApp Image 2025-05-14 at 4.11.43 PM.jpeg";
import qr from "../../assests/qrlogo.png";
import maniquipLogo1 from "../../assests/maniquip-logo-screenshot.png";
import { putFreightLast } from "../../utils/quotationItemsOrder";
import { SERIES, getSeries, isSimpleItem, computeSeriesSummary, summaryRows } from "./series-utils";
import { prepareImages, isHttpUrl } from "./image-service";

// Register custom Google Font that contains the Indian Rupee symbol (₹) using stable CDNJS assets
Font.register({
  family: "Roboto",
  fonts: [
    { src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf" },
    { src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf", fontWeight: "bold" },
    { src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf", fontStyle: "italic" },
  ],
});

// Wrap table text at spaces only: the default hyphenation split words mid-way
// ("AP-PARATUS", "FOR-WARDING") in the narrower landscape columns.
Font.registerHyphenationCallback((word) => [word]);

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
    color: "#2274B8",
    textAlign: "center",
  },
  companySubtitle: {
    fontSize: 14,
    fontFamily: "Roboto",
    fontWeight: "bold",
    color: "#2274B8",
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
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#dddddd",
    borderBottomStyle: "solid",
  },
  detailsColumn: {
    width: "25%",
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

// Relative widths of the two-series table columns; hidden columns drop out and
// the rest are scaled to fill 100%. The customer's "chosen" tick is a form-only
// aid and is NOT printed.
const COL_WEIGHT = {
  sno: 3.6, code: 9.5, name: 12, gst: 4, qty: 3.8, units: 4.4,
  spec: 13, rate: 10.5, disc: 4.5, flat: 6, amount: 12, remarks: 10, image: 7.5, video: 7.5,
};
const COL_LABEL = {
  sno: "S No.", code: "Code", name: "Item Name", gst: "GST %", qty: "Qty", units: "Units",
  spec: "Technical Spec", rate: "Rate", disc: "Disc %", flat: "Flat Disc", amount: "Amount",
  remarks: "Remarks", image: "Image", video: "Video",
};
const BAND_COLOR = {
  lite: { head: "#F0F6FC", text: "#174D7C" },
  ultra: { head: "#DCFCE7", text: "#166534" },
};

// React PDF Document Component
const QuotationPDFDocument = ({
  quotationData = {},
  selectedReferences = [],
  specialDiscount = 0,
  hiddenColumns = {},
  hiddenFields = {},
  images = {}, // photo link -> { dataUrl } (already compressed, see image-service.js)
}) => {
  const displayedQuotationNo =
    (quotationData &&
      (quotationData.quotation_no || quotationData.Quotation_No || quotationData.finalQuotationNo)) ||
    quotationData?.quotationNo ||
    "NBD-002";

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

  // Freight / Packaging stay single "simple" rows; everything else is shown
  // as the Lite Plus vs Ultra Tough comparison.
  const items = putFreightLast(quotationData.items || []);
  const normalItems = items.filter((i) => !isSimpleItem(i));
  const simpleItems = items.filter(isSimpleItem);

  const leadCols = [
    "sno",
    !hiddenColumns?.hideCode && "code",
    !hiddenColumns?.hideProductName && "name",
    !hiddenColumns?.hideGST && "gst",
    !hiddenColumns?.hideQty && "qty",
    !hiddenColumns?.hideUnits && "units",
  ].filter(Boolean);
  const bandCols = [
    !hiddenColumns?.hideDescription && "spec",
    !hiddenColumns?.hideRate && "rate",
    !hiddenColumns?.hideDisc && "disc",
    !hiddenColumns?.hideFlatDisc && "flat",
    !hiddenColumns?.hideAmount && "amount",
    !hiddenColumns?.hideRemarks && "remarks",
    !hiddenColumns?.hideImage && "image",
    !hiddenColumns?.hideVideo && "video",
  ].filter(Boolean);
  const allCols = [
    ...leadCols.map((c) => ({ id: c, col: c })),
    ...SERIES.flatMap(({ key }) => bandCols.map((c) => ({ id: `${key}_${c}`, col: c, series: key }))),
  ];
  const totalWeight = allCols.reduce((sum, c) => sum + COL_WEIGHT[c.col], 0);
  const pct = (weight) => `${((weight / totalWeight) * 100).toFixed(4)}%`;
  const colWidth = (c) => pct(COL_WEIGHT[c.col]);
  const leadWeight = leadCols.reduce((sum, c) => sum + COL_WEIGHT[c], 0);
  const bandWeight = bandCols.reduce((sum, c) => sum + COL_WEIGHT[c], 0);
  const dynamicFontSize = allCols.length > 20 ? 7 : 7.5;
  // Text that has no space to wrap at (codes, long words) would run into the
  // next column, so it is hard-wrapped to what fits the column: usable page
  // width x column share, less padding, over an average (uppercase-safe) glyph width.
  const PAGE_USABLE_PT = 802;
  const fit = (text, col) => {
    const maxChars = Math.max(4, Math.floor(((PAGE_USABLE_PT * COL_WEIGHT[col]) / totalWeight - 7) / (dynamicFontSize * 0.6)));
    return String(text || " ")
      .split(/(\s+)/)
      .map((tok) => (/\s/.test(tok) || tok.length <= maxChars ? tok : tok.match(new RegExp(`.{1,${maxChars}}`, "g")).join("\n")))
      .join("");
  };

  // Comparison footer: totals as if EVERY item were taken in each series.
  const summaryOptions = { isIGST: Boolean(quotationData.isIGST), specialDiscount };
  const summaries = Object.fromEntries(
    SERIES.map(({ key }) => [key, computeSeriesSummary(items, key, summaryOptions)])
  );
  const rowsBySeries = Object.fromEntries(
    SERIES.map(({ key }) => [key, summaryRows(summaries[key], summaryOptions.isIGST, hiddenColumns || {})])
  );
  const footerIds = ["subtotal", "flat", "igst", "cgst", "sgst", "special", "grand"].filter((id) =>
    SERIES.some(({ key }) => rowsBySeries[key].some((r) => r.id === id))
  );
  // Comparison footer: label cell, value under Amount (or the last shown column),
  // then whatever columns follow it.
  const valueIdx = bandCols.includes("amount") ? bandCols.indexOf("amount") : bandCols.length - 1;
  const preWeight = bandCols.slice(0, Math.max(valueIdx, 0)).reduce((sum, c) => sum + COL_WEIGHT[c], 0);
  const valueWeight = valueIdx >= 0 ? COL_WEIGHT[bandCols[valueIdx]] : 0;
  const postWeight = bandWeight - preWeight - valueWeight;
  const inBand = (weight) => `${((weight / bandWeight) * 100).toFixed(4)}%`;
  const money = (v) => `${v < 0 ? "-" : ""}₹${formatCurrency(Math.abs(v))}`;
  const showWords = !hiddenColumns?.hideGrandTotal;

  const seriesCellText = (item, key, col) => {
    const sr = getSeries(item, key);
    if (!(Number(sr.rate) > 0)) return "—"; // series not offered for this item
    if (col === "rate") return `₹${formatCurrency(sr.rate)}`;
    if (col === "disc") return `${sr.discount || 0}%`;
    if (col === "flat") return `₹${formatCurrency(sr.flatDiscount)}`;
    if (col === "amount") return `₹${formatCurrency(sr.amount)}`;
    return "";
  };
  const simpleCellText = (item, col) => {
    if (col === "spec") return item.description || " ";
    if (col === "rate") return `₹${formatCurrency(item.rate)}`;
    if (col === "disc") return `${item.discount || 0}%`;
    if (col === "flat") return `₹${formatCurrency(item.flatDiscount)}`;
    if (col === "amount") return `₹${formatCurrency(item.amount)}`;
    return "";
  };
  const leadCellText = (item, col, rowNo) => {
    if (col === "sno") return String(rowNo);
    if (col === "code") return fit(item.code || " ", "code");
    if (col === "name") return fit(item.name || " ", "name");
    if (col === "gst") return `${item.gst || 0}%`;
    if (col === "qty") return String(Number(item.qty) || 0);
    if (col === "units") return item.units || "Nos";
    return "";
  };
  // First column of a band gets a heavier left rule so the two series read as blocks.
  const bandStart = (c) => c.series && c.col === bandCols[0];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
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
                Phone: 0771-4900515
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

          {/* Bill To & Ship To share the row above (landscape has room for four columns) */}
            <View style={styles.detailsColumn}>
              <Text style={styles.detailsTitle}>Bill To</Text>
              <Text style={styles.detailsText}>{quotationData.consigneeAddress || " "}</Text>
            </View>
            <View style={styles.detailsColumn}>
              <Text style={styles.detailsTitle}>Ship To</Text>
              <Text style={styles.detailsText}>{quotationData.shipTo || " "}</Text>
            </View>
          </View>

          {/* Items Table: Lite Plus vs Ultra Tough */}
          <View style={styles.table}>
            <View style={styles.tableTopBorderLine} fixed />
            <View style={styles.tableBottomBorderLine} fixed />

            {/* Series banner */}
            <View style={[styles.tableRow, { backgroundColor: "#f8f9fa" }]} wrap={false}>
              <View style={[styles.tableCell, { width: pct(leadWeight), justifyContent: "center" }]}>
                <Text style={[styles.tableCellHeaderText, { fontSize: dynamicFontSize }]}>Item Details</Text>
              </View>
              {SERIES.map(({ key, title, note, warranty }, i) => (
                <View
                  key={key}
                  style={[
                    styles.tableCell,
                    {
                      width: pct(bandWeight),
                      backgroundColor: BAND_COLOR[key].head,
                      alignItems: "center",
                      borderLeftWidth: 1.5,
                      borderLeftColor: "#9ca3af",
                      borderLeftStyle: "solid",
                    },
                    i === SERIES.length - 1 ? { borderRightWidth: 0 } : {},
                  ]}
                >
                  <Text style={[styles.tableCellHeaderText, { fontSize: dynamicFontSize + 1.5, color: BAND_COLOR[key].text, textAlign: "center" }]}>
                    {title}
                  </Text>
                  <Text style={[styles.tableCellText, { fontSize: dynamicFontSize, color: BAND_COLOR[key].text, textAlign: "center" }]}>
                    {[note, warranty].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              ))}
            </View>

            {/* Column labels */}
            <View style={[styles.tableRow, styles.tableRowHeader]} wrap={false}>
              {allCols.map((c, idx) => (
                <View
                  key={c.id}
                  style={[
                    styles.tableCell,
                    { width: colWidth(c) },
                    c.series ? { backgroundColor: BAND_COLOR[c.series].head } : {},
                    bandStart(c) ? { borderLeftWidth: 1.5, borderLeftColor: "#9ca3af", borderLeftStyle: "solid" } : {},
                    idx === allCols.length - 1 ? { borderRightWidth: 0 } : {},
                  ]}
                >
                  <Text style={[styles.tableCellHeaderText, { fontSize: dynamicFontSize }]}>{COL_LABEL[c.col]}</Text>
                </View>
              ))}
            </View>

            {/* Data rows */}
            {normalItems.map((item, index) => (
              <View key={item.id ?? index} style={styles.tableRow} minPresenceAhead={24}>
                {allCols.map((c, idx) => {
                  const base = [
                    styles.tableCell,
                    { width: colWidth(c) },
                    bandStart(c) ? { borderLeftWidth: 1.5, borderLeftColor: "#9ca3af", borderLeftStyle: "solid" } : {},
                    idx === allCols.length - 1 ? { borderRightWidth: 0 } : {},
                  ];
                  if (c.col === "spec") {
                    const sr = getSeries(item, c.series);
                    return (
                      <View key={c.id} style={base}>
                        <Text style={[styles.tableCellText, { fontSize: dynamicFontSize }]}>{fit(sr.spec || "—", "spec")}</Text>
                      </View>
                    );
                  }
                  if (c.col === "remarks") {
                    const sr = getSeries(item, c.series);
                    return (
                      <View key={c.id} style={base}>
                        <Text style={[styles.tableCellText, { fontSize: dynamicFontSize }]}>{fit(sr.remarks || "—", "remarks")}</Text>
                      </View>
                    );
                  }
                  if (c.col === "image") {
                    const link = String(getSeries(item, c.series).image || "").trim();
                    const img = images[link];
                    return (
                      <View key={c.id} style={base}>
                        {!isHttpUrl(link) ? (
                          <Text style={[styles.tableCellText, { fontSize: dynamicFontSize }]}>—</Text>
                        ) : img ? (
                          <Link src={link} style={{ textDecoration: "none" }}>
                            <Image src={img.dataUrl} style={{ width: 42, height: 42, objectFit: "contain" }} />
                          </Link>
                        ) : (
                          <Link src={link} style={{ fontSize: dynamicFontSize, color: "#2274B8" }}>View Image</Link>
                        )}
                      </View>
                    );
                  }
                  if (c.col === "video") {
                    const link = String(getSeries(item, c.series).video || "").trim();
                    return (
                      <View key={c.id} style={base}>
                        {isHttpUrl(link) ? (
                          <Link src={link} style={{ textDecoration: "none" }}>
                            <View style={{ borderWidth: 1, borderColor: "#2274B8", borderStyle: "solid", backgroundColor: "#F0F6FC", borderRadius: 3, paddingVertical: 3, paddingHorizontal: 4, alignItems: "center" }}>
                              <Text style={{ fontSize: dynamicFontSize - 0.5, fontWeight: "bold", color: "#2274B8" }}>Watch Video</Text>
                            </View>
                          </Link>
                        ) : (
                          <Text style={[styles.tableCellText, { fontSize: dynamicFontSize }]}>—</Text>
                        )}
                      </View>
                    );
                  }
                  const text = c.series ? seriesCellText(item, c.series, c.col) : leadCellText(item, c.col, index + 1);
                  return (
                    <View key={c.id} style={base}>
                      <Text style={[styles.tableCellText, { fontSize: dynamicFontSize }]}>{text}</Text>
                    </View>
                  );
                })}
              </View>
            ))}

            {/* Packaging & Forwarding / Freight: one charge for the whole quotation */}
            {simpleItems.map((item, i) => (
              <View key={item.id ?? `simple-${i}`} style={[styles.tableRow, { backgroundColor: "#9ca3af" }]} minPresenceAhead={24}>
                {leadCols.map((col) => (
                  <View key={col} style={[styles.tableCell, { width: pct(COL_WEIGHT[col]) }]}>
                    <Text style={[styles.tableCellText, { fontSize: dynamicFontSize }]}>{leadCellText(item, col, normalItems.length + i + 1)}</Text>
                  </View>
                ))}
                {bandCols.map((col, idx) => (
                  <View
                    key={col}
                    style={[
                      styles.tableCell,
                      { width: pct(COL_WEIGHT[col]) },
                      idx === 0 ? { borderLeftWidth: 1.5, borderLeftColor: "#6b7280", borderLeftStyle: "solid" } : {},
                    ]}
                  >
                    <Text style={[styles.tableCellText, { fontSize: dynamicFontSize }]}>{simpleCellText(item, col)}</Text>
                  </View>
                ))}
                <View style={[styles.tableCell, { width: pct(bandWeight), borderRightWidth: 0, borderLeftWidth: 1.5, borderLeftColor: "#6b7280", borderLeftStyle: "solid" }]}>
                  <Text style={[styles.tableCellText, { fontSize: dynamicFontSize, fontStyle: "italic" }]}>Charged once, on the whole quotation</Text>
                </View>
              </View>
            ))}

            {normalItems.length === 0 && simpleItems.length === 0 && (
              <View style={styles.tableRow} wrap={false}>
                <View style={[styles.tableCell, { width: "100%", borderRightWidth: 0 }]}>
                  <Text style={[styles.tableCellText, { fontSize: dynamicFontSize }]}> </Text>
                </View>
              </View>
            )}

            {/* Comparison summary under each series: ALL items, amount + tax + grand total */}
            {footerIds.length > 0 && bandCols.length > 0 && (
              <View style={{ flexDirection: "row", borderTopWidth: 2, borderTopColor: "#cccccc", borderTopStyle: "solid" }} wrap={false}>
                <View style={[styles.tableCell, { width: pct(leadWeight), justifyContent: "center", backgroundColor: "#f8f9fa" }]}>
                  <Text style={[styles.tableCellText, { fontSize: dynamicFontSize - 0.5, fontStyle: "italic", color: "#4b5563" }]}>
                    All items compared in each series: amount, tax and grand total
                  </Text>
                </View>
                {SERIES.map(({ key }, si) => (
                  <View
                    key={key}
                    style={{
                      width: pct(bandWeight),
                      borderLeftWidth: 1.5,
                      borderLeftColor: "#9ca3af",
                      borderLeftStyle: "solid",
                    }}
                  >
                    {footerIds.map((id) => {
                      const row = rowsBySeries[key].find((r) => r.id === id);
                      const labelRow = SERIES.map(({ key: k }) => rowsBySeries[k].find((r) => r.id === id)).find(Boolean);
                      const value = row ? row.value : 0;
                      const isGrand = id === "grand";
                      const rowStyle = {
                        flexDirection: "row",
                        borderBottomWidth: 1,
                        borderBottomColor: "#dddddd",
                        borderBottomStyle: "solid",
                        backgroundColor: isGrand ? BAND_COLOR[key].head : "#ffffff",
                      };
                      const textStyle = [isGrand ? styles.tableCellHeaderText : styles.tableCellText, { fontSize: dynamicFontSize }];
                      const lastSeries = si === SERIES.length - 1;
                      if (valueIdx < 1) {
                        return (
                          <View key={id} style={rowStyle}>
                            <View style={[styles.tableCell, { width: "100%", borderRightWidth: lastSeries ? 0 : 1 }]}>
                              <Text style={[...textStyle, { textAlign: "right" }]}>{labelRow.label}: {money(value)}</Text>
                            </View>
                          </View>
                        );
                      }
                      return (
                        <View key={id} style={rowStyle}>
                          <View style={[styles.tableCell, { width: inBand(preWeight) }]}>
                            <Text style={[...textStyle, { textAlign: "right" }]}>{labelRow.label}</Text>
                          </View>
                          <View style={[styles.tableCell, { width: inBand(valueWeight), borderRightWidth: postWeight > 0 || !lastSeries ? 1 : 0 }]}>
                            <Text style={textStyle}>{money(value)}</Text>
                          </View>
                          {postWeight > 0 && (
                            <View style={[styles.tableCell, { width: inBand(postWeight), borderRightWidth: lastSeries ? 0 : 1 }]} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Amount in words, per series */}
          {showWords && (
            <View style={styles.twoColSection} wrap={false}>
              {SERIES.map(({ key, title }) => (
                <View key={key} style={styles.twoColLeft}>
                  <Text style={styles.amountWordsLabel}>{title} - Amount Chargeable (in words)</Text>
                  <Text style={styles.amountWordsText}>
                    {summaries[key].grand > 0 ? numberToWords(summaries[key].grand) : "Zero Only"}
                  </Text>
                  <Text style={[styles.grandTotalLarge, { fontSize: 11, marginTop: 4 }]}>
                    Grand Total: ₹{formatCurrency(summaries[key].grand)}
                  </Text>
                </View>
              ))}
            </View>
          )}

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
                    "The equipment is warranted against manufacturing defects for a period of 6 months from the date of invoice. An unconditional warranty of 1 month is provided, during which service and spare parts will be provided free of charge."}
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

    // Photos are shrunk in the browser first (see image-service.js); a link
    // that can't be read just prints as a "View Image" link instead.
    const photoLinks = hiddenColumns?.hideImage
      ? []
      : (quotationData.items || []).flatMap((item) =>
          isSimpleItem(item) ? [] : SERIES.map(({ key }) => getSeries(item, key).image)
        );
    const images = await prepareImages(photoLinks);

    const doc = (
      <QuotationPDFDocument
        quotationData={quotationData}
        selectedReferences={selectedReferences}
        specialDiscount={specialDiscount}
        hiddenColumns={hiddenColumns}
        hiddenFields={hiddenFields}
        images={images}
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
