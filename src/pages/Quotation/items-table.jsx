"use client";
import { useState } from "react";
import { PlusIcon, TrashIcon } from "../../components/Icons";
import Select from "react-select";

const ItemsTable = ({
  quotationData,
  handleItemChange,
  handleAddItem,
  specialDiscount,
  setSpecialDiscount,
  productCodes,
  productNames,
  productData,
  setQuotationData,
  handleSpecialDiscountChange,
  isLoading,
  hiddenColumns,
  setHiddenColumns,
  leadNob,
}) => {
  // Use props instead of local state
  const hideDisc = hiddenColumns?.hideDisc || false;
  const hideFlatDisc = hiddenColumns?.hideFlatDisc || false;
  const hideTotalFlatDisc = hiddenColumns?.hideTotalFlatDisc || false;
  const hideSpecialDiscount = hiddenColumns?.hideSpecialDiscount || false;
  const hideDescription = hiddenColumns?.hideDescription || false;
  const hideGrandTotal = hiddenColumns?.hideGrandTotal || false;
  const hideCode = hiddenColumns?.hideCode || false;
  const hideProductName = hiddenColumns?.hideProductName || false;
  const hideGST = hiddenColumns?.hideGST || false;
  const hideQty = hiddenColumns?.hideQty || false;
  const hideUnits = hiddenColumns?.hideUnits || false;
  const hideRate = hiddenColumns?.hideRate || false;
  const hideAmount = hiddenColumns?.hideAmount || false;
  const hideIGST = hiddenColumns?.hideIGST || false;
  const hideCGST = hiddenColumns?.hideCGST || false;
  const hideSGST = hiddenColumns?.hideSGST || false;
  const [showDropdown, setShowDropdown] = useState(false);

  const [activeDropdown, setActiveDropdown] = useState(null);
  const [searchTerm, setSearchTerm] = useState({});

  const calculateColSpan = () => {
    let baseSpan = 11; // Start with max columns
    if (hideCode) baseSpan -= 1;
    if (hideProductName) baseSpan -= 1;
    if (hideDescription) baseSpan -= 1;
    if (hideGST) baseSpan -= 1;
    if (hideQty) baseSpan -= 1;
    if (hideUnits) baseSpan -= 1;
    if (hideRate) baseSpan -= 1;
    if (hideDisc) baseSpan -= 1;
    if (hideFlatDisc) baseSpan -= 1;
    if (hideAmount) baseSpan -= 1;
    return baseSpan.toString();
  };

  const fieldOptions = [
    { key: "hideCode", label: "Code" },
    { key: "hideProductName", label: "Product Name" },
    { key: "hideDescription", label: "Description" },
    { key: "hideGST", label: "GST %" },
    { key: "hideQty", label: "Qty." },
    { key: "hideUnits", label: "Units" },
    { key: "hideRate", label: "Rate" },
    { key: "hideDisc", label: "Disc %" },
    { key: "hideFlatDisc", label: "Flat Disc" },
    { key: "hideAmount", label: "Amount" },
    { key: "hideSubtotal", label: "Subtotal" },
    { key: "hideTotalQty", label: "Total Qty" },
    { key: "hideTotalFlatDisc", label: "Total Flat Discount" },
    { key: "hideTaxableAmount", label: "Taxable Amount" },
    { key: "hideIGST", label: "IGST" },
    { key: "hideCGST", label: "CGST" },
    { key: "hideSGST", label: "SGST" },
    { key: "hideSpecialDiscount", label: "Special Discount" },
    { key: "hideTotalDiscount", label: "Total Discount" },
    { key: "hideGrandTotal", label: "Grand Total" },
  ];

  // Calculate taxable amount - this is subtotal (which already has flat discount applied to items)
  const taxableAmount = Math.max(0, quotationData.subtotal || 0);

  // CSS to remove up-down buttons from number inputs
  const spinnerCSS = `
    .no-spinner::-webkit-outer-spin-button,
    .no-spinner::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .no-spinner {
      -moz-appearance: textfield;
    }
  `;

  return (
    <div className="p-4 bg-white rounded-lg border shadow-sm">
      <style>{spinnerCSS}</style>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Items</h3>
          <div className="flex flex-wrap gap-2">
            {/* Dropdown for Hide/Show Fields */}
            <div className="relative">
              <button
                className="px-3 py-1 text-sm text-gray-700 rounded-md border border-gray-300 hover:bg-gray-50 flex items-center gap-1"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                Hide/Show Fields
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showDropdown && (
                <>
                  {/* Backdrop to close dropdown on outside click */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowDropdown(false)}
                  />

                  {/* Dropdown Menu */}
                  <div className="absolute right-0 z-20 mt-1 w-56 bg-white rounded-md border border-gray-300 shadow-lg max-h-96 overflow-y-auto">
                    <div className="p-2">
                      {fieldOptions.map((field) => (
                        <label
                          key={field.key}
                          className="flex items-center px-2 py-2 hover:bg-gray-50 cursor-pointer rounded"
                        >
                          <input
                            type="checkbox"
                            checked={!hiddenColumns?.[field.key]}
                            onChange={() =>
                              setHiddenColumns((prev) => ({
                                ...prev,
                                [field.key]: !prev[field.key],
                              }))
                            }
                            className="mr-3 w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
                          />
                          <span className="text-sm text-gray-700">
                            {field.label}
                          </span>
                         <span className="text-destructive">*</span></label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Add Item Button */}
            <button
              className="px-3 py-1 text-sm text-gray-700 rounded-md border border-gray-300 hover:bg-gray-50"
              onClick={handleAddItem}
              disabled={isLoading}
            >
              <PlusIcon className="inline mr-1 w-4 h-4" /> Add Item
            </button>
          </div>
        </div>

        <div
          className="overflow-x-auto relative"
        >
          {isLoading && (
            <div className="flex absolute inset-0 z-10 justify-center items-center bg-white bg-opacity-70">
              <div className="w-12 h-12 rounded-full border-t-2 border-b-2 border-primary animate-spin"></div>
            </div>
          )}
          <table
            className="min-w-full divide-y divide-gray-200"
          >
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                  S No.
                </th>
                {!hideCode && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    Code
                  </th>
                )}
                {!hideProductName && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    Product Name
                  </th>
                )}
                {!hideDescription && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    Description
                  </th>
                )}
                {!hideGST && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    GST %
                  </th>
                )}
                {!hideQty && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    Qty.
                  </th>
                )}
                {!hideUnits && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    Units
                  </th>
                )}
                {!hideRate && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    Rate
                  </th>
                )}
                {!hideDisc && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    Disc %
                  </th>
                )}
                {!hideFlatDisc && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    Flat Disc
                  </th>
                )}
                {!hideAmount && (
                  <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                    Amount
                  </th>
                )}
                <th className="px-4 py-2 text-xs font-medium text-left text-gray-500 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quotationData.items
                .filter((item) => !item.isFreight && item.name !== "Freight")
                .map((item, index) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2">{index + 1}</td>

                    {!hideCode && (
                      <td className="px-4 py-2">
                        <div className="relative">
                          <input
                            type="text"
                            value={item.code}
                            onChange={(e) => {
                              const newCode = e.target.value;
                              handleItemChange(item.id, "code", newCode);

                              if (newCode === "") {
                                handleItemChange(item.id, "name", "");
                                handleItemChange(item.id, "description", "");
                                handleItemChange(item.id, "rate", 0);
                              }

                              setSearchTerm({
                                ...searchTerm,
                                [`code-${item.id}`]: newCode,
                              });
                            }}
                            onFocus={() => {
                              setActiveDropdown(`code-${item.id}`);
                              setSearchTerm({
                                ...searchTerm,
                                [`code-${item.id}`]: item.code,
                              });
                            }}
                            className="p-1 w-24 rounded-md border border-gray-300"
                            disabled={isLoading}
                            autoComplete="off"
                          />

                          {activeDropdown === `code-${item.id}` && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActiveDropdown(null)}
                              />
                              <div className="absolute z-20 mt-1 w-56 max-h-60 overflow-y-auto bg-white rounded-md border border-gray-300 shadow-lg">
                                {productCodes
                                  .filter((code) =>
                                    code
                                      .toLowerCase()
                                      .includes(
                                        (
                                          searchTerm[`code-${item.id}`] || ""
                                        ).toLowerCase()
                                      )
                                  )
                                  .map((code) => (
                                    <div
                                      key={code}
                                      className="px-3 py-2 cursor-pointer hover:bg-primary/5"
                                      onClick={() => {
                                        handleItemChange(item.id, "code", code);
                                        setActiveDropdown(null);

                                        // Always sync with product data when code changes
                                        if (productData[code]) {
                                          const productInfo = productData[code];
                                          handleItemChange(
                                            item.id,
                                            "name",
                                            productInfo.name
                                          );
                                          const desc = productInfo.description || "";
                                          const warr = productInfo.warranty || "";
                                          const fullDesc = productInfo.name === "Freight" ? "" : (desc + (warr ? (desc ? " " : "") + warr : "")).trim();
                                          handleItemChange(
                                            item.id,
                                            "description",
                                            fullDesc
                                          );
                                          const isReseller = (leadNob || "").toString().toUpperCase() === "RESELLER";
                                          const selectedRate = isReseller ? (productInfo.reseller_rate || productInfo.rate || 0) : (productInfo.rate || 0);
                                          handleItemChange(
                                            item.id,
                                            "rate",
                                            selectedRate
                                          );
                                          handleItemChange(
                                            item.id,
                                            "gst",
                                            productInfo.name === "Freight" ? 0 : (productInfo.gst !== undefined ? productInfo.gst : 18)
                                          );
                                        }
                                      }}
                                    >
                                      {code}
                                    </div>
                                  ))}
                                {productCodes.filter((code) =>
                                  code
                                    .toLowerCase()
                                    .includes(
                                      (
                                        searchTerm[`code-${item.id}`] || ""
                                      ).toLowerCase()
                                    )
                                ).length === 0 && (
                                    <div className="px-3 py-2 text-gray-500 text-sm">
                                      No results found
                                    </div>
                                  )}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    )}

                    {!hideProductName && (
                      <td className="px-4 py-2">
                        <div className="relative min-w-[200px]">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const newName = e.target.value;
                              handleItemChange(item.id, "name", newName);

                              if (newName === "") {
                                handleItemChange(item.id, "code", "");
                                handleItemChange(item.id, "description", "");
                                handleItemChange(item.id, "rate", 0);
                              }

                              setSearchTerm({
                                ...searchTerm,
                                [`name-${item.id}`]: newName,
                              });
                            }}
                            onFocus={() => {
                              setActiveDropdown(`name-${item.id}`);
                              setSearchTerm({
                                ...searchTerm,
                                [`name-${item.id}`]: item.name,
                              });
                            }}
                            className="p-1 w-full rounded-md border border-gray-300"
                            placeholder="Enter item name"
                            disabled={isLoading}
                            required
                            autoComplete="off"
                          />

                          {activeDropdown === `name-${item.id}` && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActiveDropdown(null)}
                              />
                              <div className="absolute z-20 mt-1 w-56 max-h-60 overflow-y-auto bg-white rounded-md border border-gray-300 shadow-lg">
                                {productNames
                                  .filter((name) =>
                                    name
                                      .toLowerCase()
                                      .includes(
                                        (
                                          searchTerm[`name-${item.id}`] || ""
                                        ).toLowerCase()
                                      )
                                  )
                                  .map((name) => (
                                    <div
                                      key={name}
                                      className="px-3 py-2 cursor-pointer hover:bg-primary/5"
                                      onClick={() => {
                                        handleItemChange(item.id, "name", name);
                                        setActiveDropdown(null);

                                        // Always sync with product data when name changes
                                        if (productData[name]) {
                                          const productInfo = productData[name];
                                          handleItemChange(
                                            item.id,
                                            "code",
                                            productInfo.code
                                          );
                                          const desc = productInfo.description || "";
                                          const warr = productInfo.warranty || "";
                                          const fullDesc = name === "Freight" ? "" : (desc + (warr ? (desc ? " " : "") + warr : "")).trim();
                                          handleItemChange(
                                            item.id,
                                            "description",
                                            fullDesc
                                          );
                                          const isReseller = (leadNob || "").toString().toUpperCase() === "RESELLER";
                                          const selectedRate = isReseller ? (productInfo.reseller_rate || productInfo.rate || 0) : (productInfo.rate || 0);
                                          handleItemChange(
                                            item.id,
                                            "rate",
                                            selectedRate
                                          );
                                          handleItemChange(
                                            item.id,
                                            "gst",
                                            name === "Freight" ? 0 : (productInfo.gst !== undefined ? productInfo.gst : 18)
                                          );
                                        }
                                      }}
                                    >
                                      {name}
                                    </div>
                                  ))}
                                {productNames.filter((name) =>
                                  name
                                    .toLowerCase()
                                    .includes(
                                      (
                                        searchTerm[`name-${item.id}`] || ""
                                      ).toLowerCase()
                                    )
                                ).length === 0 && (
                                    <div className="px-3 py-2 text-gray-500 text-sm">
                                      No results found
                                    </div>
                                  )}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    )}

                    {!hideDescription && (
                      <td className="px-4 py-2">
                        <div 
                          className="relative min-w-[200px]"
                          style={{
                            width: `${Math.max(
                              200,
                              (item.description || "").length * 8
                            )}px`,
                            maxWidth: `${Math.max(
                              200,
                              (item.description || "").length * 8
                            )}px`
                          }}
                        >
                          <textarea
                            value={item.description || ""}
                            onChange={(e) =>
                              handleItemChange(
                                item.id,
                                "description",
                                e.target.value
                              )
                            }
                            className="p-1 w-full rounded-md border border-gray-300"
                            style={{
                              height: "auto",
                              minHeight: "32px",
                              maxWidth: `${Math.max(
                                200,
                                (item.description || "").length * 8
                              )}px`
                            }}
                            placeholder="Enter description"
                            disabled={isLoading}
                          />
                        </div>
                      </td>
                    )}

                    {!hideGST && (
                      <td className="px-4 py-2">
                        <select
                          value={String(item.gst)}
                          onChange={(e) =>
                            handleItemChange(item.id, "gst", e.target.value)
                          }
                          className="p-1 w-20 rounded-md border border-gray-300"
                          disabled={isLoading}
                        >
                          <option value="0">0%</option>
                          <option value="5">5%</option>
                          <option value="18">18%</option>
                        </select>
                      </td>
                    )}

                    {!hideQty && (
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={item.qty || ""}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "qty",
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                          className="p-1 w-16 rounded-md border border-gray-300 no-spinner"
                          placeholder=""
                          onWheel={(e) => e.target.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                          min="0"
                          required
                          disabled={isLoading}
                        />
                      </td>
                    )}

                    {!hideUnits && (
                      <td className="px-4 py-2">
                        <select
                          value={item.units}
                          onChange={(e) =>
                            handleItemChange(item.id, "units", e.target.value)
                          }
                          className="p-1 w-20 rounded-md border border-gray-300"
                          disabled={isLoading}
                        >
                          <option value="Nos">Nos</option>
                          <option value="Kg">Kg</option>
                          <option value="Roll">Roll</option>
                          <option value="Rmt">Rmt</option>
                          <option value="Ltr">Ltr</option>
                          <option value="Bag">Bag</option>
                          <option value="Pair">Pair</option>
                          <option value="Set">Set</option>
                          <option value="Mtr">Mtr</option>
                          <option value="sqmtr">sqmtr</option>
                          <option value="Box">Box</option>
                          <option value="Pc">Pc</option>
                        </select>
                      </td>
                    )}

                    {!hideRate && (
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={item.rate || ""}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "rate",
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                          className="p-1 w-24 rounded-md border border-gray-300 no-spinner"
                          placeholder="0.00"
                          onWheel={(e) => e.target.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                          step="0.01"
                          min="0"
                          disabled={isLoading}
                          required
                        />
                      </td>
                    )}

                    {!hideDisc && (
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={item.discount || ""}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "discount",
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                          className="p-1 w-20 rounded-md border border-gray-300 no-spinner"
                          placeholder=""
                          onWheel={(e) => e.target.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                          step="0.01"
                          min="0"
                          max="100"
                          disabled={isLoading}
                        />
                      </td>
                    )}

                    {!hideFlatDisc && (
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={item.flatDiscount || ""}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "flatDiscount",
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                          className="p-1 w-16 rounded-md border border-gray-300 no-spinner"
                          placeholder=""
                          onWheel={(e) => e.target.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                          step="0.01"
                          min="0"
                          disabled={isLoading}
                        />
                      </td>
                    )}

                    {!hideAmount && (
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.amount || ""}
                          className="p-1 w-24 bg-gray-50 rounded-md border border-gray-300"
                          readOnly
                        />
                      </td>
                    )}

                    <td className="px-4 py-2">
                      <button
                        className="p-1 text-destructive rounded-md hover:text-destructive"
                        onClick={() => {
                          setQuotationData((prev) => {
                            const newItems = prev.items.filter(
                              (i) => i.id !== item.id
                            );
                            if (newItems.length === 0) {
                              return prev;
                            }

                            const subtotal = newItems.reduce(
                              (sum, current) => sum + Number(current.amount || 0),
                              0
                            );
                            const totalFlatDiscount = newItems.reduce(
                              (sum, current) =>
                                sum + Number(current.flatDiscount || 0),
                              0
                            );

                            let cgstAmount = 0;
                            let sgstAmount = 0;
                            let igstAmount = 0;

                            newItems.forEach((current) => {
                              const amount = Number(current.amount || 0);
                              let itemGST = Number(current.gst || 0);

                              if (amount <= 0 || itemGST <= 0) {
                                return;
                              }

                              if (
                                String(current.gst).toUpperCase().includes("IGST")
                              ) {
                                itemGST = itemGST / 2;
                              }

                              if (prev.isIGST) {
                                igstAmount += (amount * itemGST) / 100;
                              } else {
                                const halfGST = itemGST / 2;
                                const contribution = (amount * halfGST) / 100;
                                cgstAmount += contribution;
                                sgstAmount += contribution;
                              }
                            });

                            const roundedSubtotal = Number(subtotal.toFixed(2));
                            cgstAmount = Number(cgstAmount.toFixed(2));
                            sgstAmount = Number(sgstAmount.toFixed(2));
                            igstAmount = Number(igstAmount.toFixed(2));

                            const total = Math.max(
                              0,
                              Number(
                                (
                                  roundedSubtotal +
                                  cgstAmount +
                                  sgstAmount +
                                  igstAmount
                                ).toFixed(2)
                              )
                            );

                            const cgstRate =
                              !prev.isIGST && roundedSubtotal > 0
                                ? Number(
                                  (
                                    (cgstAmount / roundedSubtotal) *
                                    100
                                  ).toFixed(2)
                                )
                                : 0;
                            const sgstRate =
                              !prev.isIGST && roundedSubtotal > 0
                                ? Number(
                                  (
                                    (sgstAmount / roundedSubtotal) *
                                    100
                                  ).toFixed(2)
                                )
                                : 0;
                            const igstRate =
                              prev.isIGST && roundedSubtotal > 0
                                ? Number(
                                  (
                                    (igstAmount / roundedSubtotal) *
                                    100
                                  ).toFixed(2)
                                )
                                : 0;

                            return {
                              ...prev,
                              items: newItems,
                              totalFlatDiscount,
                              subtotal: roundedSubtotal,
                              cgstAmount,
                              sgstAmount,
                              igstAmount,
                              total,
                              cgstRate: prev.isIGST ? 0 : cgstRate,
                              sgstRate: prev.isIGST ? 0 : sgstRate,
                              igstRate: prev.isIGST ? igstRate : 0,
                            };
                          });
                        }}
                        disabled={
                          quotationData.items.filter(
                            (i) => !i.isFreight && i.name !== "Freight"
                          ).length <= 1 || isLoading
                        }
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}

              {/* Freight Item Row */}
              {(() => {
                const freightItem = quotationData.items.find(
                  (item) => item.isFreight || item.name === "Freight"
                );
                if (!freightItem) return null;

                const normalItems = quotationData.items.filter(
                  (item) => !item.isFreight && item.name !== "Freight"
                );
                const freightSNo = normalItems.length + 1;

                return (
                  <tr key={freightItem.id} className="bg-gray-300 text-gray-900 border-gray-500">
                    <td className="px-4 py-2">{freightSNo}</td>

                    {!hideCode && (
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={freightItem.code || ""}
                          className="p-1 w-24 rounded-md border border-gray-500 bg-gray-400 text-gray-800 cursor-not-allowed"
                          disabled
                        />
                      </td>
                    )}

                    {!hideProductName && (
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value="Freight"
                          className="p-1 w-full min-w-[200px] rounded-md border border-gray-500 bg-gray-400 text-gray-900 cursor-not-allowed"
                          disabled
                        />
                      </td>
                    )}

                    {!hideDescription && (
                      <td className="px-4 py-2">
                        <div 
                          className="relative min-w-[200px]"
                          style={{
                            width: `${Math.max(
                              200,
                              (freightItem.description || "").length * 8
                            )}px`,
                            maxWidth: `${Math.max(
                              200,
                              (freightItem.description || "").length * 8
                            )}px`
                          }}
                        >
                          <textarea
                            value={freightItem.description || ""}
                            onChange={(e) =>
                              handleItemChange(
                                freightItem.id,
                                "description",
                                e.target.value
                              )
                            }
                            className="p-1 w-full rounded-md border border-gray-300 bg-white text-gray-700 resize-none"
                            style={{
                              height: "auto",
                              minHeight: "32px",
                              maxWidth: `${Math.max(
                                200,
                                (freightItem.description || "").length * 8
                              )}px`
                            }}
                            placeholder="Enter description"
                            disabled={isLoading}
                          />
                        </div>
                      </td>
                    )}

                    {!hideGST && (
                      <td className="px-4 py-2">
                        <select
                          value={String(freightItem.gst)}
                          onChange={(e) =>
                            handleItemChange(
                              freightItem.id,
                              "gst",
                              e.target.value
                            )
                          }
                          className="p-1 w-20 rounded-md border border-gray-300 bg-white text-gray-700"
                          disabled={isLoading}
                        >
                          <option value="0">0%</option>
                          <option value="5">5%</option>
                          <option value="18">18%</option>
                        </select>
                      </td>
                    )}

                    {!hideQty && (
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={freightItem.qty || ""}
                          onChange={(e) =>
                            handleItemChange(
                              freightItem.id,
                              "qty",
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0"
                          className="p-1 w-16 rounded-md border border-gray-300 no-spinner bg-white text-gray-700"
                          onWheel={(e) => e.target.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                          min="0"
                          disabled={isLoading}
                        />
                      </td>
                    )}

                    {!hideUnits && (
                      <td className="px-4 py-2">
                        <select
                          value={freightItem.units}
                          onChange={(e) =>
                            handleItemChange(
                              freightItem.id,
                              "units",
                              e.target.value
                            )
                          }
                          className="p-1 w-20 rounded-md border border-gray-300 bg-white text-gray-700"
                          disabled={isLoading}
                        >
                          <option value="Nos">Nos</option>
                          <option value="Kg">Kg</option>
                          <option value="Roll">Roll</option>
                          <option value="Rmt">Rmt</option>
                          <option value="Ltr">Ltr</option>
                          <option value="Bag">Bag</option>
                          <option value="Pair">Pair</option>
                          <option value="Set">Set</option>
                          <option value="Mtr">Mtr</option>
                          <option value="sqmtr">sqmtr</option>
                          <option value="Box">Box</option>
                          <option value="Pc">Pc</option>
                        </select>
                      </td>
                    )}

                    {!hideRate && (
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={freightItem.rate || ""}
                          onChange={(e) =>
                            handleItemChange(
                              freightItem.id,
                              "rate",
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0.00"
                          className="p-1 w-24 rounded-md border border-gray-300 no-spinner bg-white text-gray-700"
                          onWheel={(e) => e.target.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                          step="0.01"
                          min="0"
                          disabled={isLoading}
                        />
                      </td>
                    )}

                    {!hideDisc && (
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={freightItem.discount || ""}
                          onChange={(e) =>
                            handleItemChange(
                              freightItem.id,
                              "discount",
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0"
                          className="p-1 w-20 rounded-md border border-gray-300 no-spinner bg-white text-gray-700"
                          onWheel={(e) => e.target.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                          step="0.01"
                          min="0"
                          max="100"
                          disabled={isLoading}
                        />
                      </td>
                    )}

                    {!hideFlatDisc && (
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={freightItem.flatDiscount || ""}
                          onChange={(e) =>
                            handleItemChange(
                              freightItem.id,
                              "flatDiscount",
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0"
                          className="p-1 w-16 rounded-md border border-gray-300 no-spinner bg-white text-gray-700"
                          onWheel={(e) => e.target.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                          step="0.01"
                          min="0"
                          disabled={isLoading}
                        />
                      </td>
                    )}

                    {!hideAmount && (
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={freightItem.amount || "0.00"}
                          className="p-1 w-24 bg-gray-400 rounded-md border border-gray-500 text-gray-800 cursor-not-allowed"
                          readOnly
                        />
                      </td>
                    )}

                    <td className="px-4 py-2">
                      <button
                        className="p-1 text-destructive rounded-md hover:text-destructive"
                        onClick={() => {
                          setQuotationData((prev) => {
                            const newItems = prev.items.filter(
                              (i) => i.id !== freightItem.id
                            );

                            const subtotal = newItems.reduce(
                              (sum, current) => sum + Number(current.amount || 0),
                              0
                            );
                            const totalFlatDiscount = newItems.reduce(
                              (sum, current) =>
                                sum + Number(current.flatDiscount || 0),
                              0
                            );

                            let cgstAmount = 0;
                            let sgstAmount = 0;
                            let igstAmount = 0;

                            newItems.forEach((current) => {
                              const amount = Number(current.amount || 0);
                              let itemGST = Number(current.gst || 0);

                              if (amount <= 0 || itemGST <= 0) {
                                return;
                              }

                              if (
                                String(current.gst).toUpperCase().includes("IGST")
                              ) {
                                itemGST = itemGST / 2;
                              }

                              if (prev.isIGST) {
                                igstAmount += (amount * itemGST) / 100;
                              } else {
                                const halfGST = itemGST / 2;
                                const contribution = (amount * halfGST) / 100;
                                cgstAmount += contribution;
                                sgstAmount += contribution;
                              }
                            });

                            const roundedSubtotal = Number(subtotal.toFixed(2));
                            cgstAmount = Number(cgstAmount.toFixed(2));
                            sgstAmount = Number(sgstAmount.toFixed(2));
                            igstAmount = Number(igstAmount.toFixed(2));

                            const total = Math.max(
                              0,
                              Number(
                                (
                                  roundedSubtotal +
                                  cgstAmount +
                                  sgstAmount +
                                  igstAmount
                                ).toFixed(2)
                              )
                            );

                            const cgstRate =
                              !prev.isIGST && roundedSubtotal > 0
                                ? Number(
                                  (
                                    (cgstAmount / roundedSubtotal) *
                                    100
                                  ).toFixed(2)
                                )
                                : 0;
                            const sgstRate =
                              !prev.isIGST && roundedSubtotal > 0
                                ? Number(
                                  (
                                    (sgstAmount / roundedSubtotal) *
                                    100
                                  ).toFixed(2)
                                )
                                : 0;
                            const igstRate =
                              prev.isIGST && roundedSubtotal > 0
                                ? Number(
                                  (
                                    (igstAmount / roundedSubtotal) *
                                    100
                                  ).toFixed(2)
                                )
                                : 0;

                            return {
                              ...prev,
                              items: newItems,
                              totalFlatDiscount,
                              subtotal: roundedSubtotal,
                              cgstAmount,
                              sgstAmount,
                              igstAmount,
                              total,
                              cgstRate: prev.isIGST ? 0 : cgstRate,
                              sgstRate: prev.isIGST ? 0 : sgstRate,
                              igstRate: prev.isIGST ? igstRate : 0,
                            };
                          });
                        }}
                        disabled={isLoading}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })()}
            </tbody>
            <tfoot>
              {/* Subtotal */}
              {!hiddenColumns?.hideSubtotal && (
                <tr>
                  <td
                    colSpan={calculateColSpan()}
                    className="px-4 py-2 font-medium text-right"
                  >
                    Subtotal:
                  </td>
                  <td className="p-2 border">
                    ₹
                    {typeof quotationData.subtotal === "number"
                      ? quotationData.subtotal.toFixed(2)
                      : "0.00"}
                  </td>
                  <td></td>
                </tr>
              )}

              {/* Total Qty */}
              {!hiddenColumns?.hideTotalQty && (
                <tr>
                  <td
                    colSpan={calculateColSpan()}
                    className="px-4 py-2 font-medium text-right"
                  >
                    Total Qty:
                  </td>
                  <td className="px-4 py-2">
                    {quotationData.items.reduce(
                      (sum, item) => sum + (Number(item.qty) || 0),
                      0
                    )}
                  </td>
                  <td></td>
                </tr>
              )}

              {/* Total Flat Discount */}
              {!hideTotalFlatDisc && (
                <tr>
                  <td
                    colSpan={calculateColSpan()}
                    className="px-4 py-2 font-medium text-right"
                  >
                    Total Flat Discount:
                  </td>
                  <td className="p-2">
                    ₹
                    {typeof quotationData.totalFlatDiscount === "number"
                      ? quotationData.totalFlatDiscount.toFixed(2)
                      : "0.00"}
                  </td>
                  <td></td>
                </tr>
              )}

              {/* Taxable Amount */}
              {!hiddenColumns?.hideTaxableAmount && (
                <tr className="border">
                  <td
                    colSpan={calculateColSpan()}
                    className="px-4 py-2 font-medium text-right"
                  >
                    Taxable Amount:
                  </td>
                  <td className="px-4 py-2">₹{taxableAmount.toFixed(2)}</td>
                  <td></td>
                </tr>
              )}

              {/* IGST Section */}
              {!hideIGST && quotationData.isIGST && (
                <>
                  {Object.entries(quotationData.igstBreakdown || {}).map(
                    ([rate, value]) => (
                      <tr className="border" key={`igst-${rate}`}>
                        <td
                          colSpan={calculateColSpan()}
                          className="px-4 py-2 font-medium text-right"
                        >
                          IGST ({Number(rate)}%):
                        </td>
                        <td className="px-4 py-2">
                          ₹{Number(value).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    )
                  )}
                  <tr className="border">
                    <td
                      colSpan={calculateColSpan()}
                      className="px-4 py-2 font-medium text-right"
                    >
                      IGST Total:
                    </td>
                    <td className="px-4 py-2">
                      ₹{(quotationData.igstAmount || 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </>
              )}

              {/* CGST Section */}
              {!hideCGST && !quotationData.isIGST && (
                <>
                  {Object.entries(quotationData.cgstBreakdown || {}).map(
                    ([rate, value]) => (
                      <tr className="border" key={`cgst-${rate}`}>
                        <td
                          colSpan={calculateColSpan()}
                          className="px-4 py-2 font-medium text-right"
                        >
                          CGST ({Number(rate)}%):
                        </td>
                        <td className="px-4 py-2">
                          ₹{Number(value).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    )
                  )}
                  <tr className="border">
                    <td
                      colSpan={calculateColSpan()}
                      className="px-4 py-2 font-medium text-right"
                    >
                      CGST Total:
                    </td>
                    <td className="px-4 py-2">
                      ₹{(quotationData.cgstAmount || 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </>
              )}

              {/* SGST Section */}
              {!hideSGST && !quotationData.isIGST && (
                <>
                  {Object.entries(quotationData.sgstBreakdown || {}).map(
                    ([rate, value]) => (
                      <tr className="border" key={`sgst-${rate}`}>
                        <td
                          colSpan={calculateColSpan()}
                          className="px-4 py-2 font-medium text-right"
                        >
                          SGST ({Number(rate)}%):
                        </td>
                        <td className="px-4 py-2">
                          ₹{Number(value).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    )
                  )}
                  <tr className="border">
                    <td
                      colSpan={calculateColSpan()}
                      className="px-4 py-2 font-medium text-right"
                    >
                      SGST Total:
                    </td>
                    <td className="px-4 py-2">
                      ₹{(quotationData.sgstAmount || 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </>
              )}

              {/* Special Discount */}
              {!hideSpecialDiscount && (
                <tr>
                  <td
                    colSpan={calculateColSpan()}
                    className="px-4 py-2 font-medium text-right"
                  >
                    Special Discount:
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={specialDiscount || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSpecialDiscount(value);
                        handleSpecialDiscountChange(value);
                      }}
                      className="p-1 w-24 rounded-md border border-gray-300 no-spinner"
                      onWheel={(e) => e.target.blur()}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                          e.preventDefault();
                        }
                      }}
                      step="0.01"
                      min="0"
                      placeholder=""
                      disabled={isLoading}
                    />
                  </td>
                  <td></td>
                </tr>
              )}

              {/* Total Discount */}
              {!hiddenColumns?.hideTotalDiscount && (
                <tr>
                  <td
                    colSpan={calculateColSpan()}
                    className="px-4 py-2 font-medium text-right"
                  >
                    Total Discount:
                  </td>
                  <td className="px-4 py-2">
                    ₹
                    {(() => {
                      const discountFromPercentage = quotationData.items.reduce(
                        (sum, item) => {
                          const itemTotal = item.qty * item.rate;
                          return sum + itemTotal * (item.discount / 100);
                        },
                        0
                      );
                      const totalDiscount =
                        discountFromPercentage +
                        quotationData.totalFlatDiscount +
                        (Number(specialDiscount) || 0);
                      return totalDiscount.toFixed(2);
                    })()}
                  </td>
                  <td></td>
                </tr>
              )}

              {/* Grand Total */}
              {!hideGrandTotal && (
                <tr className="font-bold">
                  <td
                    colSpan={calculateColSpan()}
                    className="px-4 py-2 text-right"
                  >
                    Grand Total:
                  </td>
                  <td className="px-4 py-2">
                    ₹
                    {(() => {
                      const totalTaxAmount =
                        quotationData.cgstAmount +
                        quotationData.sgstAmount +
                        quotationData.igstAmount;

                      const grandTotal =
                        quotationData.subtotal +
                        totalTaxAmount -
                        (Number(specialDiscount) || 0);

                      return Math.max(0, grandTotal).toFixed(2);
                    })()}
                  </td>
                  <td></td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ItemsTable;
