import { useState, useEffect, useRef, useContext, useMemo, useCallback } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import ColumnSelector from "../../components/ColumnSelector";
import { FilterSearch } from "../../components/FilterBar";
import DataTable from "../../components/DataTable";
import ModalForm from "../../components/ModalForm";
import supabase from "../../utils/supabase";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";

function Items() {
  const { showNotification } = useContext(AuthContext) || {};
  const { askConfirm, confirmDialog } = useConfirmDialog();

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
        showNotification("Failed to save item: " + message, "error");
      }
      setIsLoading(false);
    }
  };

  const handleDelete = useCallback(async (item) => {
    if (!item?.uuid) {
      if (showNotification) showNotification("Cannot delete: this item has no uuid.", "error");
      return;
    }
    askConfirm({ title: "Delete item?", message: `Are you sure you want to delete ${item.item_name}?`, confirmText: "Delete" }, async () => {
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
        if (showNotification) showNotification("Failed to delete item: " + (err.message || err), "error");
        setIsLoading(false);
      }
    });
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
        <td key="actions" className="px-4 py-3 whitespace-nowrap text-sm text-center">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleOpenModal("edit", row)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-info transition-colors hover:bg-accent"
              aria-label={`Edit ${row.item_name}`}
              title="Edit Item"
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(row)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
              aria-label={`Delete ${row.item_name}`}
              title="Delete Item"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </td>
      ),
      item_name: (
        <td key="item_name" className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-center">
          {row.item_name}
        </td>
      ),
      item_code: (
        <td key="item_code" className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-primary text-center">
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
        <td key="rate" className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center">
          {row.rate !== null && row.rate !== undefined ? (
            <span>₹{Number(row.rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          ) : (
            <span className="text-gray-400 font-normal italic">-</span>
          )}
        </td>
      ),
      description: (
        <td key="description" className="px-4 py-3 text-sm text-gray-600 min-w-[200px] truncate max-w-xs text-center" title={row.description}>
          {row.description || <span className="text-gray-400 font-normal italic">-</span>}
        </td>
      )
    };

    return (
      <tr key={row.uuid || index}>
        {visibleHeaders.map(col => columnCells[col.key])}
      </tr>
    );
  }, [visibleHeaders, handleOpenModal, handleDelete]);

  const renderCard = useCallback((item, index) => {
    return (
      <div key={item.uuid || index} className="bg-card p-4 rounded-lg border">
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
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t">
          <button type="button" onClick={() => handleOpenModal("edit", item)} className="flex h-8 w-8 items-center justify-center rounded-md text-info hover:bg-accent" aria-label={`Edit ${item.item_name}`}><Pencil size={16} aria-hidden="true" /></button>
          <button type="button" onClick={() => handleDelete(item)} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" aria-label={`Delete ${item.item_name}`}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      </div>
    );
  }, [handleOpenModal, handleDelete]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 gap-3">
      {/* Top Filter & Controls Section */}
      <div className="flex flex-wrap items-center gap-2 shrink-0 w-full">
        <h2 className="mr-2 text-base font-semibold text-foreground shrink-0">Items Master</h2>

        <FilterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search items by name, code, rate..."
          className="max-w-[320px]"
        />

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {searchQuery && (
            <button
              type="button"
              className="h-9 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-md transition-colors shrink-0"
              onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
            >
              Clear Filter
            </button>
          )}

          <button
            type="button"
            onClick={fetchItems}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Refresh items"
            title="Refresh Items"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
          </button>

          {/* Column visibility */}
          <div ref={columnToggleRef}>
            <ColumnSelector
              idPrefix="items-col"
              options={allHeaders}
              visible={Object.fromEntries(allHeaders.map((col) => [col.key, !hiddenColumns.includes(col.key)]))}
              onToggle={(key) =>
                setHiddenColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
              }
              onSelectAll={() =>
                setHiddenColumns(hiddenColumns.length === 0 ? allHeaders.map((col) => col.key) : [])
              }
              open={showColumnToggle}
              onOpenChange={setShowColumnToggle}
            />
          </div>

          <button
            type="button"
            onClick={() => handleOpenModal("add")}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={16} aria-hidden="true" />
            Add Item
          </button>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <DataTable
          ariaLabel="Items"
          emptyTitle="No items found"
          emptyDescription="Add an item or adjust your search."
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
            <label htmlFor="item-field-1" className="block text-sm font-medium text-foreground">Item Name *</label>
            <input
              id="item-field-1"
              type="text"
              required
              placeholder="e.g. Solar Panel 400W"
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="item-field-2" className="block text-sm font-medium text-foreground">Item Code</label>
            <input
              id="item-field-2"
              type="text"
              placeholder="e.g. ITM-001"
              value={formData.item_code}
              onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="item-field-3" className="block text-sm font-medium text-foreground">Rate (₹)</label>
            <input
              id="item-field-3"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 1500.00"
              value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div className="space-y-2 col-span-1 md:col-span-2">
            <label htmlFor="item-field-4" className="block text-sm font-medium text-foreground">Description</label>
            <textarea
              id="item-field-4"
              rows={3}
              placeholder="Enter additional details or specifications..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
            />
          </div>
        </div>
      </ModalForm>
      {confirmDialog}
    </div>
  );
}

export default Items;
