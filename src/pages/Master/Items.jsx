import { useState, useEffect, useRef, useContext, useMemo, useCallback } from "react";
import { Search, Plus, Pencil, Trash2, RefreshCw, Eye } from "lucide-react";
import DataTable from "../../components/DataTable";
import ModalForm from "../../components/ModalForm";
import supabase from "../../utils/supabase";
import { AuthContext } from "../../App";

function Items() {
  const { showNotification } = useContext(AuthContext) || {};

  const [searchQuery, setSearchQuery] = useState("");
  const [itemsData, setItemsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // "add" or "edit"
  const [currentItem, setCurrentItem] = useState(null);

  // Column Visibility State
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const columnToggleRef = useRef(null);
  const [hiddenColumns, setHiddenColumns] = useState([]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);

  // Form State
  const [formData, setFormData] = useState({
    item_name: "",
    item_code: "",
    rate: "",
    description: ""
  });

  const fetchIdRef = useRef(0);

  // Debounce search input so we don't fire a query per keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (columnToggleRef.current && !columnToggleRef.current.contains(event.target)) {
        setShowColumnToggle(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // True server-side paginated + filtered fetch (only the current page's rows
  // ever land in memory, replacing the old "load all 3,500+ rows" approach).
  const fetchItems = useCallback(async () => {
    fetchIdRef.current += 1;
    const currentFetchId = fetchIdRef.current;

    setIsLoading(true);

    try {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase.from("lto_items").select("*", { count: "exact" });

      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        // rate is numeric and can't take ilike, so text search covers name/code/description only
        query = query.or(`item_name.ilike.${term},item_code.ilike.${term},description.ilike.${term}`);
      }

      query = query.order("item_name", { ascending: true }).range(from, to);

      const { data, error, count } = await query;
      if (currentFetchId !== fetchIdRef.current) return; // a newer fetch superseded this one
      if (error) throw error;

      setItemsData(data || []);
      setTotalResults(count || 0);
    } catch (error) {
      console.error("Error fetching items:", error);
      if (showNotification) {
        showNotification("Failed to fetch items: " + error.message, "error");
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [showNotification, currentPage, itemsPerPage, debouncedSearch]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Reset to page 1 whenever the search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const handleOpenModal = useCallback((mode, item = null) => {
    setModalMode(mode);
    setCurrentItem(item);
    if (item && mode === "edit") {
      setFormData({
        item_name: item.item_name || "",
        item_code: item.item_code || "",
        rate: item.rate !== null && item.rate !== undefined ? String(item.rate) : "",
        description: item.description || ""
      });
    } else {
      setFormData({
        item_name: "",
        item_code: "",
        rate: "",
        description: ""
      });
    }
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setCurrentItem(null);
    setFormData({
      item_name: "",
      item_code: "",
      rate: "",
      description: ""
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.item_name.trim()) {
      if (showNotification) showNotification("Item Name is required", "error");
      return;
    }

    // Edit mode must always operate on a specific, known uuid -- never fall
    // back to name/code matching, since duplicate names can exist in the data.
    if (modalMode === "edit" && !currentItem?.uuid) {
      if (showNotification) showNotification("Cannot save: this item has no uuid. Please refresh and try again.", "error");
      return;
    }

    setIsLoading(true);
    const payload = {
      item_name: formData.item_name.trim(),
      item_code: formData.item_code.trim() || null,
      rate: formData.rate !== "" && formData.rate !== null ? parseFloat(formData.rate) : null,
      description: formData.description.trim() || null
    };

    try {
      if (modalMode === "add") {
        const { data, error } = await supabase.from("lto_items").insert([payload]).select().single();
        if (error) throw error;
        if (!data) throw new Error("Insert did not return the new row.");
        if (showNotification) showNotification("Item added successfully", "success");
      } else {
        // Re-check the row still exists at this uuid before updating, so a
        // stale/deleted currentItem can't silently update the wrong record.
        const { data: existing, error: checkError } = await supabase
          .from("lto_items")
          .select("uuid")
          .eq("uuid", currentItem.uuid)
          .maybeSingle();
        if (checkError) throw checkError;
        if (!existing) {
          throw new Error("This item no longer exists in the database (it may have been deleted). Please refresh.");
        }

        const { data, error } = await supabase
          .from("lto_items")
          .update(payload)
          .eq("uuid", currentItem.uuid)
          .select()
          .single();
        if (error) throw error;
        if (!data) throw new Error("Update did not affect any row.");
        if (showNotification) showNotification("Item updated successfully", "success");
      }

      await fetchItems();
      handleCloseModal();
    } catch (err) {
      console.error("Error saving item:", err);
      const message = err?.code === "23505"
        ? `An item named "${payload.item_name}" already exists. Choose a different name.`
        : (err.message || String(err));
      if (showNotification) {
        showNotification("Failed to save item: " + message, "error");
      } else {
        alert("Failed to save item: " + message);
      }
      setIsLoading(false);
    }
  };

  const handleDelete = useCallback(async (item) => {
    if (!item?.uuid) {
      if (showNotification) showNotification("Cannot delete: this item has no uuid.", "error");
      return;
    }
    if (window.confirm(`Are you sure you want to delete ${item.item_name}?`)) {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("lto_items")
          .delete()
          .eq("uuid", item.uuid)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          throw new Error("This item was already removed (no matching uuid found).");
        }
        if (showNotification) showNotification("Item deleted successfully", "success");
        await fetchItems();
      } catch (err) {
        console.error("Error deleting item:", err);
        if (showNotification) {
          showNotification("Failed to delete item: " + (err.message || err), "error");
        } else {
          alert("Failed to delete item: " + (err.message || err));
        }
        setIsLoading(false);
      }
    }
  }, [showNotification, fetchItems]);

  // Header column configuration
  const allHeaders = useMemo(() => [
    { key: "actions", label: "Actions" },
    { key: "item_name", label: "Item Name" },
    { key: "item_code", label: "Item Code" },
    { key: "rate", label: "Rate (₹)" },
    { key: "description", label: "Description" }
  ], []);

  const visibleHeaders = useMemo(() => allHeaders.filter(col => !hiddenColumns.includes(col.key)), [allHeaders, hiddenColumns]);
  const headers = useMemo(() => visibleHeaders.map(col => col.label), [visibleHeaders]);

  const renderRow = useCallback((row, index) => {
    const columnCells = {
      actions: (
        <td key="actions" className="px-6 py-4 whitespace-nowrap text-sm text-center">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => handleOpenModal("edit", row)}
              className="text-info hover:text-info transition-colors"
              title="Edit Item"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => handleDelete(row)}
              className="text-destructive hover:text-destructive transition-colors"
              title="Delete Item"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      ),
      item_name: (
        <td key="item_name" className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-center">
          {row.item_name}
        </td>
      ),
      item_code: (
        <td key="item_code" className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-primary text-center">
          {row.item_code ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded border border-primary/20 bg-primary/5 text-primary text-xs font-mono font-semibold">
              {row.item_code}
            </span>
          ) : (
            <span className="text-gray-400 font-normal italic">-</span>
          )}
        </td>
      ),
      rate: (
        <td key="rate" className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-center">
          {row.rate !== null && row.rate !== undefined ? (
            <span>₹{Number(row.rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          ) : (
            <span className="text-gray-400 font-normal italic">-</span>
          )}
        </td>
      ),
      description: (
        <td key="description" className="px-6 py-4 text-sm text-gray-600 min-w-[200px] truncate max-w-xs text-center" title={row.description}>
          {row.description || <span className="text-gray-400 font-normal italic">-</span>}
        </td>
      )
    };

    return (
      <tr key={row.uuid || index} className="hover:bg-primary/30 transition-colors border-b border-gray-100 last:border-0">
        {visibleHeaders.map(col => columnCells[col.key])}
      </tr>
    );
  }, [visibleHeaders, handleOpenModal, handleDelete]);

  const renderCard = useCallback((item, index) => {
    return (
      <div key={item.uuid || index} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-start mb-2">
          <div className="flex flex-col">
            <span className="font-semibold text-gray-800">{item.item_name}</span>
            {item.item_code && (
              <span className="text-xs font-semibold font-mono text-primary mt-0.5">
                Code: {item.item_code}
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-gray-900">
            {item.rate !== null && item.rate !== undefined ? `₹${Number(item.rate).toLocaleString('en-IN')}` : "-"}
          </span>
        </div>
        {item.description && (
          <div className="text-sm text-gray-600 mb-3 line-clamp-2">
            {item.description}
          </div>
        )}
        <div className="flex justify-end gap-4 mt-2 pt-2 border-t border-gray-100">
          <button onClick={() => handleOpenModal("edit", item)} className="text-info" title="Edit"><Pencil size={16} /></button>
          <button onClick={() => handleDelete(item)} className="text-destructive" title="Delete"><Trash2 size={16} /></button>
        </div>
      </div>
    );
  }, [handleOpenModal, handleDelete]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Top Filter & Controls Section */}
      <div className="flex flex-col gap-3 mb-3 bg-white shrink-0 p-1">
        <div className="flex flex-wrap items-center gap-2 shrink-0 pb-1 w-full">
          {/* Title / Label */}
          <div className="text-lg font-bold text-gray-800 shrink-0 mr-2 border-r border-gray-200 pr-4">
            Items Master
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search items by name, code, rate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-primary block pl-10 h-9"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {searchQuery && (
              <button
                className="px-3 h-9 text-sm text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-md transition-colors shrink-0"
                onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
              >
                Clear Filter
              </button>
            )}

            <button
              onClick={fetchItems}
              className="px-3 h-9 bg-white border border-gray-300 rounded-md shadow-sm text-gray-600 hover:bg-gray-50 hover:text-primary transition-colors"
              title="Refresh Items"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            </button>

            {/* Column Visibility Toggle Button & Popover */}
            <div className="relative" ref={columnToggleRef}>
              <button
                type="button"
                onClick={() => setShowColumnToggle(prev => !prev)}
                className="px-3 h-9 bg-white border border-gray-300 rounded-md shadow-sm text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors flex items-center gap-2"
                title="Toggle Column Visibility"
              >
                <Eye size={16} />
                <span>Columns</span>
              </button>

              {showColumnToggle && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2 max-h-80 overflow-y-auto">
                  <div className="text-xs font-bold text-gray-500 uppercase px-2 py-1 border-b border-gray-100 flex justify-between items-center mb-1">
                    <span>Visible Columns</span>
                    <button 
                      onClick={() => setHiddenColumns([])}
                      className="text-[11px] text-primary hover:underline capitalize font-normal"
                    >
                      Show All
                    </button>
                  </div>
                  {allHeaders.map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded text-xs font-medium text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.includes(col.key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setHiddenColumns(hiddenColumns.filter(k => k !== col.key));
                          } else {
                            setHiddenColumns([...hiddenColumns, col.key]);
                          }
                        }}
                        className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => handleOpenModal("add")}
              className="px-3 h-9 bg-primary hover:opacity-90 text-white rounded-md shadow-sm transition-colors flex items-center gap-2"
            >
              <Plus size={16} />
              <span className="font-medium text-sm">Add Item</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <DataTable
          headers={headers}
          data={itemsData}
          renderRow={renderRow}
          renderCard={renderCard}
          minWidth="1000px"
          currentPage={currentPage}
          totalPages={Math.ceil(totalResults / itemsPerPage) || 1}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
          totalResults={totalResults}
          itemsPerPageOptions={[10, 20, 50]}
        />
      </div>

      {/* Add / Edit Modal */}
      <ModalForm
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={modalMode === "add" ? "Add Item" : "Edit Item"}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 col-span-1 md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Item Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Solar Panel 400W"
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Item Code</label>
            <input
              type="text"
              placeholder="e.g. ITM-001"
              value={formData.item_code}
              onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Rate (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 1500.00"
              value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-2 col-span-1 md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={3}
              placeholder="Enter additional details or specifications..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
        </div>
      </ModalForm>
    </div>
  );
}

export default Items;
