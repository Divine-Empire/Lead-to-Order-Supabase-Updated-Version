"use client";
import { useState } from "react";
import {
  CopyIcon,
  ShareIcon,
  EyeIcon,
  DownloadIcon,
} from "../../components/Icons";
import { putFreightLast } from "../../utils/quotationItemsOrder";
import { SERIES, getSeries, isSimpleItem, computeSeriesSummary, summaryRows } from "./series-utils";
import logo from "../../assests/WhatsApp Image 2025-05-14 at 4.11.43 PM.jpeg";
import maniquipLogo from "../../assests/maniquip-logo-screenshot.png";
import { useCompressedImage, imageCandidates, isHttpUrl } from "./image-service";

const money = (v) => `${v < 0 ? "-" : ""}₹${Math.abs(Number(v || 0)).toFixed(2)}`;

const BAND_HEAD = { lite: "bg-[#F0F6FC] text-[#174D7C]", ultra: "bg-[#DCFCE7] text-[#166534]" };

// Same layout as the PDF: item details once, then Lite Plus and Ultra Tough
// side by side, with a comparison summary under each series covering ALL items.
// The customer's "chosen" tick is a form-only aid and is not shown here.
function SeriesItemsTable({ quotationData, hiddenColumns, specialDiscount }) {
  const items = putFreightLast(quotationData.items || []);
  const normal = items.filter((i) => !isSimpleItem(i));
  const simple = items.filter(isSimpleItem);
  const hide = (k) => Boolean(hiddenColumns?.[k]);

  const lead = [
    "sno",
    !hide("hideCode") && "code",
    !hide("hideProductName") && "name",
    !hide("hideGST") && "gst",
    !hide("hideQty") && "qty",
    !hide("hideUnits") && "units",
  ].filter(Boolean);
  const cols = [
    !hide("hideDescription") && "spec",
    !hide("hideRate") && "rate",
    !hide("hideDisc") && "disc",
    !hide("hideFlatDisc") && "flat",
    !hide("hideAmount") && "amount",
    !hide("hideRemarks") && "remarks",
    !hide("hideImage") && "image",
    !hide("hideVideo") && "video",
  ].filter(Boolean);
  const labels = {
    sno: "S No.", code: "Code", name: "Item Name", gst: "GST %", qty: "Qty", units: "Units",
    spec: "Technical Spec", rate: "Rate", disc: "Disc %", flat: "Flat Disc", amount: "Amount",
    remarks: "Remarks", image: "Image", video: "Video",
  };

  const summaryOptions = { isIGST: Boolean(quotationData.isIGST), specialDiscount };
  const rowsBySeries = Object.fromEntries(
    SERIES.map(({ key }) => [key, summaryRows(computeSeriesSummary(items, key, summaryOptions), summaryOptions.isIGST, hiddenColumns || {})])
  );
  const footerIds = ["subtotal", "flat", "igst", "cgst", "sgst", "special", "grand"].filter((id) =>
    SERIES.some(({ key }) => rowsBySeries[key].some((r) => r.id === id))
  );
  const cell = "p-2 border align-top";

  const leadCell = (item, col, rowNo) => {
    if (col === "sno") return rowNo;
    if (col === "code") return item.code || "—";
    if (col === "name") return item.name || "—";
    if (col === "gst") return `${item.gst || 0}%`;
    if (col === "qty") return Number(item.qty) || 0;
    return item.units || "Nos";
  };

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm text-black [&_th]:border-[#cccccc] [&_td]:border-[#cccccc]">
        <thead>
          <tr className="border bg-[#f8f9fa]">
            <th colSpan={lead.length} className="p-2 text-left border">Item Details</th>
            {SERIES.map((series) => (
              <th key={series.key} colSpan={Math.max(cols.length, 1)} className={`p-2 text-center border border-l-2 border-l-[#9ca3af] ${BAND_HEAD[series.key]}`}>
                <div className="font-semibold">{series.title}</div>
                <div className="text-xs font-normal">{[series.note, series.warranty].filter(Boolean).join(" · ")}</div>
              </th>
            ))}
          </tr>
          <tr className="border bg-[#f8f9fa]">
            {lead.map((c) => <th key={c} className="p-2 text-left border">{labels[c]}</th>)}
            {SERIES.map((series) =>
              cols.map((c, idx) => (
                <th key={`${series.key}-${c}`} className={`p-2 text-left border ${idx === 0 ? "border-l-2 border-l-[#9ca3af]" : ""} ${BAND_HEAD[series.key]}`}>
                  {labels[c]}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {normal.map((item, index) => (
            <tr key={item.id} className="border">
              {lead.map((c) => <td key={c} className={cell}>{leadCell(item, c, index + 1)}</td>)}
              {SERIES.map(({ key }) => {
                const sr = getSeries(item, key);
                const offered = Number(sr.rate) > 0;
                return cols.map((c, idx) => {
                  let content = "—";
                  if (c === "spec") {
                    content = <span className="whitespace-pre-line">{sr.spec || "—"}</span>;
                  } else if (c === "remarks") {
                    content = <span className="whitespace-pre-line">{sr.remarks || "—"}</span>;
                  } else if (c === "image") {
                    content = <PreviewImage link={sr.image} />;
                  } else if (c === "video") {
                    content = <VideoButton link={sr.video} />;
                  } else if (offered) {
                    if (c === "rate") content = money(sr.rate);
                    else if (c === "disc") content = `${sr.discount || 0}%`;
                    else if (c === "flat") content = money(sr.flatDiscount);
                    else if (c === "amount") content = money(sr.amount);
                  }
                  return <td key={`${key}-${c}`} className={`${cell} ${idx === 0 ? "border-l-2 border-l-[#9ca3af]" : ""}`}>{content}</td>;
                });
              })}
            </tr>
          ))}
          {simple.map((item, i) => (
            <tr key={item.id} className="border bg-[#9ca3af] text-black">
              {lead.map((c) => <td key={c} className={cell}>{leadCell(item, c, normal.length + i + 1)}</td>)}
              {cols.map((c, idx) => {
                let content = "";
                if (c === "spec") content = item.description || "";
                else if (c === "rate") content = money(item.rate);
                else if (c === "disc") content = `${item.discount || 0}%`;
                else if (c === "flat") content = money(item.flatDiscount);
                else if (c === "amount") content = money(item.amount);
                return <td key={c} className={`${cell} ${idx === 0 ? "border-l-2 border-l-[#9ca3af]" : ""}`}>{content}</td>;
              })}
              <td colSpan={Math.max(cols.length, 1)} className={`${cell} border-l-2 border-l-[#9ca3af] italic`}>Charged once, on the whole quotation</td>
            </tr>
          ))}
        </tbody>
        {footerIds.length > 0 && cols.length > 0 && (
          <tfoot>
            {footerIds.map((id, rowIdx) => (
              <tr key={id} className="border">
                {rowIdx === 0 && (
                  <td colSpan={lead.length} rowSpan={footerIds.length} className="p-2 text-xs italic text-[#4b5563] align-middle border bg-[#f8f9fa]">
                    All items compared in each series: amount, tax and grand total
                  </td>
                )}
                {SERIES.map(({ key }) => {
                  const row = rowsBySeries[key].find((r) => r.id === id);
                  const labelRow = SERIES.map(({ key: k }) => rowsBySeries[k].find((r) => r.id === id)).find(Boolean);
                  const grand = id === "grand";
                  const tone = grand ? `font-bold ${BAND_HEAD[key]}` : "";
                  const value = money(row ? row.value : 0);
                  // The value sits under Amount (or the last shown column).
                  const valueIdx = cols.includes("amount") ? cols.indexOf("amount") : cols.length - 1;
                  if (valueIdx < 1) {
                    return <td key={key} colSpan={cols.length} className={`p-2 text-right border border-l-2 border-l-[#9ca3af] ${tone}`}>{labelRow.label}: {value}</td>;
                  }
                  return (
                    <FooterBand key={key} span={valueIdx} trail={cols.length - 1 - valueIdx} label={labelRow.label} value={value} tone={tone} />
                  );
                })}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}

function FooterBand({ span, trail, label, value, tone }) {
  return (
    <>
      <td colSpan={span} className={`p-2 text-right border border-l-2 border-l-[#9ca3af] ${tone}`}>{label}</td>
      <td className={`p-2 border ${tone}`}>{value}</td>
      {trail > 0 && <td colSpan={trail} className={`border ${tone}`} />}
    </>
  );
}

// Compressed thumbnail; click opens the original link in a new tab.
function PreviewImage({ link }) {
  const { status, image } = useCompressedImage(link);
  if (!isHttpUrl(link)) return "—";
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" title="Open image in a new tab" className="block h-14 w-14 overflow-hidden rounded border border-[#cccccc] bg-white">
      {status === "ready" && <img src={image.dataUrl} alt="Item" className="h-full w-full object-contain" />}
      {status === "loading" && <span className="block h-full w-full animate-pulse bg-[#e5e7eb]" />}
      {status === "failed" && <FallbackImage link={link} />}
    </a>
  );
}

// Video: just a button that opens the link in a new tab (same as in the PDF).
function VideoButton({ link }) {
  if (!isHttpUrl(link)) return "—";
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="inline-block rounded border border-[#2274B8] bg-[#F0F6FC] px-2 py-1 text-xs font-semibold text-[#2274B8] no-underline">
      Watch Video
    </a>
  );
}

// Amount in words + grand total for each series.
function SeriesWords({ quotationData, specialDiscount, numberToWords }) {
  const items = quotationData.items || [];
  return (
    <div className="grid grid-cols-2 gap-4 mt-4">
      {SERIES.map(({ key, title }) => {
        const { grand } = computeSeriesSummary(items, key, { isIGST: Boolean(quotationData.isIGST), specialDiscount });
        return (
          <div key={key}>
            <p className="font-bold">{title} - Amount Chargeable (in words)</p>
            <p>{grand > 0 ? numberToWords(grand) : "Zero Only"}</p>
            <p className="mt-1 text-lg font-bold">Grand Total: {money(grand)}</p>
          </div>
        );
      })}
    </div>
  );
}

// Function to convert number to words for Indian Rupees
const numberToWords = (num) => {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'
  ];
  const teens = [
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  const convertHundreds = (n) => {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertHundreds(n % 100) : '');
    if (n < 100000) return convertHundreds(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convertHundreds(n % 1000) : '');
    if (n < 10000000) return convertHundreds(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convertHundreds(n % 100000) : '');
    return convertHundreds(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convertHundreds(n % 10000000) : '');
  };

  if (num === 0) return 'Zero';

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  let result = '';
  if (rupees > 0) {
    result += convertHundreds(rupees) + ' Rupees';
  }
  if (paise > 0) {
    if (rupees > 0) result += ' and ';
    result += convertHundreds(paise) + ' Paise';
  }

  return result + ' Only';
};

const QuotationPreview = ({
  quotationData,
  quotationLink,
  pdfUrl,
  selectedReferences,
  specialDiscount,
  imageform,
  handleGenerateLink,
  handleGeneratePDF,
  isGenerating,
  isSubmitting,
  hiddenColumns,
  hiddenFields, // ← यह add करें

}) => {
  return (
    <div className="space-y-6">
      <div id="quotation-preview" className="p-6 bg-white rounded-lg border">
        <div className="flex justify-between items-center pb-3 border-b border-black">
          <img src={logo} alt="Divine Empire" className="h-12 w-auto" />
          <div className="text-center">
            <p className="text-xl font-bold text-[#2274B8]">DIVINE EMPIRE INDIA</p>
            <p className="font-bold text-[#2274B8]">( PVT. LTD. )</p>
          </div>
          <img src={maniquipLogo} alt="ManiQuip" className="h-12 w-auto" />
        </div>

        <div className="flex justify-between items-start py-3 border-b border-[#dddddd]">
          <h1 className="text-xl font-bold">QUOTATION</h1>
          <div className="text-right text-sm">
            <p className="font-bold">Quo No: {quotationData.quotationNo}</p>
            <p>Date: {quotationData.date}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 py-3 text-sm border-b border-[#dddddd]">
          <div>
            <h3 className="mb-1 font-bold">Consignor Details</h3>
            <p>DIVINE EMPIRE INDIA( PVT. LTD. )</p>
            {selectedReferences?.length > 0 && <p>{selectedReferences.join(", ")}</p>}
            <p>{quotationData.consignorAddress}</p>
            <p>Mobile: {quotationData.consignorMobile}</p>
            <p>Phone: 0771-4900515</p>
            <p>GSTIN: {quotationData.consignorGSTIN}</p>
            <p>State Code: {quotationData.consignorStateCode}</p>
            <p>MSME Number: {quotationData.msmeNumber}</p>
          </div>
          <div>
            <h3 className="mb-1 font-bold">Consignee Details</h3>
            <p>Company Name: {quotationData.consigneeName}</p>
            <p>Contact Name: {quotationData.consigneeContactName}</p>
            <p>Contact No.: {quotationData.consigneeContactNo}</p>
            <p>State: {quotationData.consigneeState}</p>
            <p>GSTIN: {quotationData.consigneeGSTIN}</p>
            <p>State Code: {quotationData.consigneeStateCode}</p>
          </div>
          <div>
            <h3 className="mb-1 font-bold">Bill To</h3>
            <p>{quotationData.consigneeAddress}</p>
          </div>
          <div>
            <h3 className="mb-1 font-bold">Ship To</h3>
            <p>{quotationData.shipTo}</p>
          </div>
        </div>

        <SeriesItemsTable quotationData={quotationData} hiddenColumns={hiddenColumns} specialDiscount={specialDiscount} />

        {!hiddenColumns?.hideGrandTotal && (
          <SeriesWords quotationData={quotationData} specialDiscount={specialDiscount} numberToWords={numberToWords} />
        )}

        <div className="pt-4 mt-4 border-t">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="flex justify-center items-center p-6 rounded-lg border border-gray-200">
              <img
                src={imageform || "/placeholder.svg?height=200&width=300"}
                alt="ManiQuip Logo"
                className="object-contain w-auto max-h-100"
              />
            </div>

            <div>
              <h3 className="mb-2 font-bold">Terms & Conditions</h3>
              <table className="w-full">
  <tbody>
    {!hiddenFields?.validity && (
      <tr>
        <td className="py-1 font-medium">Validity</td>
        <td className="py-1">{quotationData.validity}</td>
      </tr>
    )}
    {!hiddenFields?.paymentTerms && (
      <tr>
        <td className="py-1 font-medium">Payment Terms</td>
        <td className="py-1">{quotationData.paymentTerms}</td>
      </tr>
    )}
    {!hiddenFields?.delivery && (
      <tr>
        <td className="py-1 font-medium">Delivery</td>
        <td className="py-1">{quotationData.delivery}</td>
      </tr>
    )}
    {!hiddenFields?.freight && (
      <tr>
        <td className="py-1 font-medium">Freight</td>
        <td className="py-1">{quotationData.freight}</td>
      </tr>
    )}
    {!hiddenFields?.insurance && (
      <tr>
        <td className="py-1 font-medium">Insurance</td>
        <td className="py-1">{quotationData.insurance}</td>
      </tr>
    )}
    {!hiddenFields?.taxes && (
      <tr>
        <td className="py-1 font-medium">Taxes</td>
        <td className="py-1">{quotationData.taxes}</td>
      </tr>
    )}
    {!hiddenFields?.afterReceiptOfMaterial && (
      <tr>
        <td className="py-1 font-medium">After Receipt of Material</td>
        <td className="py-1">{quotationData.afterReceiptOfMaterial}</td>
      </tr>
    )}
    {!hiddenFields?.technicalSupport && (
      <tr>
        <td className="py-1 font-medium">Technical Support</td>
        <td className="py-1">{quotationData.technicalSupport}</td>
      </tr>
    )}
  </tbody>
</table>

              {quotationData.specialOffers &&
                quotationData.specialOffers.filter((offer) => offer.trim())
                  .length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 font-bold text-orange-600">
                      Divine Empire's 10th Anniversary Special Offer
                    </h4>
                    <div className="p-3 bg-orange-50 rounded border border-orange-200">
                      {quotationData.specialOffers
                        .filter((offer) => offer.trim())
                        .map((offer, index) => (
                          <p key={index} className="mb-2 last:mb-0">
                            • {offer}
                          </p>
                        ))}
                    </div>
                  </div>
                )}

              {quotationData.notes &&
                quotationData.notes.filter((note) => note.trim()).length >
                  0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 font-bold">Notes</h4>
                    <ul className="pl-5 list-disc">
                      {quotationData.notes
                        .filter((note) => note.trim())
                        .map((note, index) => (
                          <li key={index} className="py-1">
                            {note}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t">
          <div>
            <h3 className="mb-2 font-bold">Bank Details</h3>
            <p>Account No.: {quotationData.accountNo || "N/A"}</p>
            <p>Bank Name: {quotationData.bankName || "N/A"}</p>
            <p>Bank Address: {quotationData.bankAddress || "N/A"}</p>
            <p>IFSC CODE: {quotationData.ifscCode || "N/A"}</p>
            <p>Email: {quotationData.email || "N/A"}</p>
            <p>Website: {quotationData.website || "N/A"}</p>
            <p>Company PAN: {quotationData.pan || "N/A"}</p>
          </div>
          <div className="text-right">
            <h3 className="mb-2 font-bold">Declaration:</h3>
            <p>
              We declare that this Quotation shows the actual price of the goods
              described and that all particulars are true and correct.
            </p>
            <p className="mt-4">
              Prepared By: {quotationData.preparedBy || "N/A"}
            </p>
            <p className="mt-4 text-sm italic">
              This Quotation is computer-generated and does not require a seal
              or signature.
            </p>
          </div>
        </div>
      </div>

      {quotationLink && (
        <div className="p-4 bg-gray-50 rounded-md border">
          <p className="mb-2 font-medium">Quotation Link:</p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={quotationLink}
              readOnly
              className="p-2 w-full rounded-md border border-gray-300"
            />
            <button
              className="p-2 rounded-md border border-gray-300 hover:bg-gray-100"
              onClick={() => {
                navigator.clipboard.writeText(quotationLink);
                alert("Quotation link copied to clipboard");
              }}
            >
              <CopyIcon className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-md border border-gray-300 hover:bg-gray-100">
              <ShareIcon className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Share this link with the client. They can view and request updates
            to the quotation.
          </p>
        </div>
      )}

      {pdfUrl && (
        <div className="p-4 bg-gray-50 rounded-md border">
          <p className="mb-2 font-medium">PDF Document:</p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={pdfUrl}
              readOnly
              className="p-2 w-full rounded-md border border-gray-300"
            />
            <button
              className="p-2 rounded-md border border-gray-300 hover:bg-gray-100"
              onClick={() => {
                navigator.clipboard.writeText(pdfUrl);
                alert("PDF URL copied to clipboard");
              }}
            >
              <CopyIcon className="w-4 h-4" />
            </button>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md border border-gray-300 hover:bg-gray-100"
            >
              <EyeIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button className="flex items-center px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50">
          <EyeIcon className="mr-2 w-4 h-4" />
          View as Client
        </button>
        <div className="space-x-2">
          <button
            className="flex inline-flex items-center px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
            onClick={handleGenerateLink}
            disabled={isGenerating || isSubmitting}
          >
            <ShareIcon className="mr-2 w-4 h-4" />
            Generate Link
          </button>
          <button
            className="flex inline-flex items-center px-4 py-2 text-white bg-primary rounded-md hover:opacity-90"
            onClick={handleGeneratePDF}
            disabled={isGenerating || isSubmitting}
          >
            <DownloadIcon className="mr-2 w-4 h-4" />
            {isGenerating ? "Generating..." : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuotationPreview;

// Used when the browser can't read the image to shrink it (CORS): show the
// original image as-is; if even that can't load, a plain "View image" label.
function FallbackImage({ link }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-medium text-[#2274B8]">View image</span>;
  return <img src={imageCandidates(link)[0]} alt="Item" loading="lazy" className="h-full w-full object-contain" onError={() => setBroken(true)} />;
}
