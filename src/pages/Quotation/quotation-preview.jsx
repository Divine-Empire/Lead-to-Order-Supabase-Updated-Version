"use client";
import {
  CopyIcon,
  ShareIcon,
  EyeIcon,
  DownloadIcon,
} from "../../components/Icons";
import { putFreightLast } from "../../utils/quotationItemsOrder";

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
        <div className="flex justify-between items-start pb-4 border-b">
          <div className="w-1/3">
            <p className="font-bold">
              {selectedReferences[0] || "Consignor Name"}
            </p>
            <p className="text-sm">
              {quotationData.consignorAddress || "Consignor Address"}
            </p>
            <p className="text-sm">
              Mobile: {quotationData.consignorMobile?.split(",")[0] || "N/A"}
            </p>
            <p className="text-sm">
              Phone: {quotationData.consignorPhone || "N/A"}
            </p>
            <p className="text-sm">
              GSTIN: {quotationData.consignorGSTIN || "N/A"}
            </p>
            <p className="text-sm">
              State Code: {quotationData.consignorStateCode || "N/A"}
            </p>
          </div>
          <div className="w-1/3 text-center">
            <h1 className="text-xl font-bold">QUOTATION</h1>
          </div>
          <div className="w-1/3 text-right">
            <p className="font-bold">Quo No: {quotationData.quotationNo}</p>
            <p>Date: {quotationData.date}</p>
            <p>Prepared By: {quotationData.preparedBy || "N/A"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pb-4 border-b">
          <div>
            <h3 className="mb-2 font-bold">Consignor Details</h3>
            <p>{selectedReferences[0] || "N/A"}</p>
            <p>{quotationData.consignorAddress || "N/A"}</p>
            <p>GSTIN: {quotationData.consignorGSTIN || "N/A"}</p>
            <p>State Code: {quotationData.consignorStateCode || "N/A"}</p>
            <p>MSME Number: {quotationData.msmeNumber || "N/A"}</p>
          </div>
          <div>
            <h3 className="mb-2 font-bold">Consignee Details</h3>
            <p>Company Name: {quotationData.consigneeName || "N/A"}</p>
            <p>Contact Name: {quotationData.consigneeContactName || "N/A"}</p>
            <p>Contact No.: {quotationData.consigneeContactNo || "N/A"}</p>
            <p>State: {quotationData.consigneeState || "N/A"}</p>
            <p>GSTIN: {quotationData.consigneeGSTIN || "N/A"}</p>
            <p>State Code: {quotationData.consigneeStateCode || "N/A"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pb-4 border-b">
          <div>
            <h3 className="mb-2 font-bold">Bill To</h3>
            <p>{quotationData.consigneeAddress || "N/A"}</p>
          </div>
          <div>
            <h3 className="mb-2 font-bold">Ship To</h3>
            <p>{quotationData.shipTo || "N/A"}</p>
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border">
                <th className="p-2 text-left border">S No.</th>
                <th className="p-2 text-left border">Code</th>
                <th className="p-2 text-left border">Product Name</th>
                <th className="p-2 text-left border">Description</th>
                <th className="p-2 text-left border">GST %</th>
                <th className="p-2 text-left border">Qty</th>
                <th className="p-2 text-left border">Units</th>
                <th className="p-2 text-left border">Rate</th>
                {!hiddenColumns?.hideDisc && (
                  <th className="p-2 text-left border">Disc %</th>
                )}
                {!hiddenColumns?.hideFlatDisc && (
                  <th className="p-2 text-left border">Flat Disc</th>
                )}
                <th className="p-2 text-left border">Amount</th>
              </tr>
            </thead>
            <tbody>
              {putFreightLast(quotationData.items).map((item, index) => (
                <tr
                  key={item.id}
                  className={
                    item.isFreight || item.name === "Freight"
                      ? "border bg-gray-400 text-gray-900 border-gray-500"
                      : "border"
                  }
                >
                  <td className="p-2 border">{index + 1}</td>
                  <td className="p-2 border">{item.code || "N/A"}</td>
                  <td className="p-2 border">{item.name || "N/A"}</td>
                  <td className="p-2 border">{item.description || "N/A"}</td>
                  <td className="p-2 border">{item.gst}%</td>
                  <td className="p-2 border">{item.qty}</td>
                  <td className="p-2 border">{item.units}</td>
                  <td className="p-2 border">
                    ₹{Number(item.rate).toFixed(2)}
                  </td>
                  {!hiddenColumns?.hideDisc && (
                    <td className="p-2 border">{item.discount}%</td>
                  )}
                  {!hiddenColumns?.hideFlatDisc && (
                    <td className="p-2 border">
                      ₹{Number(item.flatDiscount).toFixed(2)}
                    </td>
                  )}
                  <td className="p-2 border">
                    ₹{Number(item.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border">
                <td
                  colSpan={(() => {
                    let span = 9; // Base columns: S No, Code, Product Name, Description, GST, Qty, Units, Rate, Amount
                    if (!hiddenColumns?.hideDisc) span += 1;
                    if (!hiddenColumns?.hideFlatDisc) span += 1;
                    return span - 1; // Subtract 1 because Amount column is separate
                  })()}
                  className="p-2 font-bold text-right border"
                >
                  Subtotal
                </td>
                <td className="p-2 font-bold border">
                  ₹{Number(quotationData.subtotal).toFixed(2)}
                </td>
              </tr>
              <tr className="border">
                <td
                  colSpan={(() => {
                    let span = 9;
                    if (!hiddenColumns?.hideDisc) span += 1;
                    if (!hiddenColumns?.hideFlatDisc) span += 1;
                    return span - 1;
                  })()}
                  className="p-2 text-right border"
                >
                  Total Qty
                </td>
                <td className="p-2 border">
                  {quotationData.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)}
                </td>
              </tr>
              {!hiddenColumns?.hideTotalFlatDisc && (
                <tr className="border">
                  <td
                    colSpan={(() => {
                      let span = 9;
                      if (!hiddenColumns?.hideDisc) span += 1;
                      if (!hiddenColumns?.hideFlatDisc) span += 1;
                      return span - 1;
                    })()}
                    className="p-2 text-right border"
                  >
                    Total Flat Discount
                  </td>
                  <td className="p-2 border">
                    -₹{Number(quotationData.totalFlatDiscount).toFixed(2)}
                  </td>
                </tr>
              )}
              <tr className="border">
                <td
                  colSpan={(() => {
                    let span = 9;
                    if (!hiddenColumns?.hideDisc) span += 1;
                    if (!hiddenColumns?.hideFlatDisc) span += 1;
                    return span - 1;
                  })()}
                  className="p-2 text-right border"
                >
                  Taxable Amount
                </td>
                <td className="p-2 border">
                  ₹
                  {(() => {
                    // Calculate taxable amount correctly
                    // Subtotal already includes item-level percentage and flat discounts
                    // Special discount is applied separately in grand total calculation
                    // So taxable amount should just be the subtotal (no additional deduction needed)
                    return Number(quotationData.subtotal || 0).toFixed(2);
                  })()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <h3 className="mb-2 font-bold">Tax Breakdown</h3>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 border">
                  <th className="p-2 text-left border">Tax Type</th>
                  <th className="p-2 text-left border">Rate</th>
                  <th className="p-2 text-left border">Amount</th>
                </tr>
              </thead>
              <tbody>
                {quotationData.isIGST ? (
                  <>
                    {Object.entries(quotationData.igstBreakdown || {}).map(
                      ([rate, value]) => (
                        <tr className="border" key={`igst-${rate}`}>
                          <td className="p-2 border">IGST</td>
                          <td className="p-2 border">{Number(rate)}%</td>
                          <td className="p-2 border">₹{Number(value).toFixed(2)}</td>
                        </tr>
                      )
                    )}
                  </>
                ) : (
                  <>
                    {Object.entries(quotationData.cgstBreakdown || {}).map(
                      ([rate, value]) => (
                        <tr className="border" key={`cgst-${rate}`}>
                          <td className="p-2 border">CGST</td>
                          <td className="p-2 border">{Number(rate)}%</td>
                          <td className="p-2 border">₹{Number(value).toFixed(2)}</td>
                        </tr>
                      )
                    )}
                    {Object.entries(quotationData.sgstBreakdown || {}).map(
                      ([rate, value]) => (
                        <tr className="border" key={`sgst-${rate}`}>
                          <td className="p-2 border">SGST</td>
                          <td className="p-2 border">{Number(rate)}%</td>
                          <td className="p-2 border">₹{Number(value).toFixed(2)}</td>
                        </tr>
                      )
                    )}
                  </>
                )}
                {!hiddenColumns?.hideSpecialDiscount && (
                  <tr className="border">
                    <td colSpan="2" className="p-2 text-right border">
                      Special Discount
                    </td>
                    <td className="p-2 border">
                      -₹{Number(specialDiscount).toFixed(2)}
                    </td>
                  </tr>
                )}
                <tr className="font-bold border">
                  <td colSpan="2" className="p-2 text-right border">
                    Grand Total
                  </td>
                  <td className="p-2 border">
                    ₹{Number(quotationData.total).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-col justify-between">
            <div>
              <p className="font-bold">Amount Chargeable (in words)</p>
              <p className="capitalize">
                {Number(quotationData.total) > 0
                  ? numberToWords(quotationData.total)
                  : "Zero Only"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold">
                Grand Total: ₹{Number(quotationData.total).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

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
