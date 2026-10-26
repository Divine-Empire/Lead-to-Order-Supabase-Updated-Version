import { useState, useEffect, useRef, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, RefreshCw, ArrowRight } from "lucide-react";
import { FilterSearch } from "../../components/FilterBar";
import DataTable from "../../components/DataTable";
import ModalForm from "../../components/ModalForm";
import supabase from "../../utils/supabase";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import { ITEM_UNITS, addItem, itemErrorMessage } from "../../utils/itemCatalog";

const EMPTY_FORM = { item_name: "", item_code: "", unit: "Nos" };
const HEADERS = ["Item Code", { label: "Item Name", className: "!text-left" }, "Actions"];

// Master > Items: list + Add Item. Full details (Basic / Lite / UT series)
// are edited on the item's own page, /master/items/:id (ItemDetails.jsx).
function Items() {
  const { showNotification, currentUser } = useContext(AuthContext) || {};
  const { askConfirm, confirmDialog } = useConfirmDialog();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [itemsData, setItemsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalResults, setTotalResults] = useState(0);

  const fetchIdRef = useRef(0);

  // Debounce search input so we don't fire a query per keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Server-side paginated + filtered fetch (only the current page is loaded).
  const fetchItems = useCallback(async () => {
    fetchIdRef.current += 1;
    const currentFetchId = fetchIdRef.current;
    setIsLoading(true);

    try {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase.from("lto_items").select("uuid, item_name, item_code", { count: "exact" });
      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        query = query.or(`item_name.ilike.${term},item_code.ilike.${term}`);
      }
      query = query.order("item_name", { ascending: true }).range(from, to);

      const { data, error, count } = await query;
      if (currentFetchId !== fetchIdRef.current) return; // a newer fetch superseded this one
      if (error) throw error;

      setItemsData(data || []);
      setTotalResults(count || 0);
    } catch (error) {
      console.error("Error fetching items:", error);
      showNotification?.("Failed to fetch items: " + error.message, "error");
    } finally {
      if (currentFetchId === fetchIdRef.current) setIsLoading(false);
    }
  }, [showNotification, currentPage, itemsPerPage, debouncedSearch]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setFormData(EMPTY_FORM);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = formData.item_name.trim();
    const code = formData.item_code.trim();
    if (!name || !code) {
      showNotification?.("Item Name and Item Code are required", "error");
      return;
    }

    setIsSaving(true);
    try {
      await addItem({ name, code, unit: formData.unit, updatedBy: currentUser?.fullName || currentUser?.username });
      showNotification?.("Item added successfully", "success");
      handleCloseModal();
      await fetchItems();
    } catch (err) {
      console.error("Error adding item:", err);
      showNotification?.("Failed to add item: " + itemErrorMessage(err), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = useCallback((item) => {
    if (!item?.uuid) return;
    askConfirm(
      {
        title: "Delete item?",
        message: `Are you sure you want to delete ${item.item_name}? Its Lite / UT series details will be deleted too.`,
        confirmText: "Delete",
      },
      async () => {
        setIsLoading(true);
        try {
          const { data, error } = await supabase.from("lto_items").delete().eq("uuid", item.uuid).select("uuid").maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("This item was already removed.");
          showNotification?.("Item deleted successfully", "success");
          await fetchItems();
        } catch (err) {
          console.error("Error deleting item:", err);
          showNotification?.("Failed to delete item: " + (err.message || err), "error");
          setIsLoading(false);
        }
      }
    );
  }, [askConfirm, showNotification, fetchItems]);

  const openItem = useCallback((item) => navigate(`/master/items/${item.uuid}`), [navigate]);

  const codeBadge = (code) =>
    code ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded border border-primary/20 bg-primary/5 text-primary text-xs font-mono font-semibold">
        {code}
      </span>
    ) : (
      <span className="text-gray-400 font-normal italic">-</span>
    );

  const actionButtons = (item) => (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => handleDelete(item)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
        aria-label={`Delete ${item.item_name}`}
        title="Delete item"
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => openItem(item)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
        aria-label={`Open details of ${item.item_name}`}
        title="Open item details"
      >
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );

  const renderRow = (row, index) => (
    <tr key={row.uuid || index}>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center w-40">{codeBadge(row.item_code)}</td>
      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-left whitespace-normal break-words">{row.item_name}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-center w-32">{actionButtons(row)}</td>
    </tr>
  );

  const renderCard = (item, index) => (
    <div key={item.uuid || index} className="bg-card p-4 rounded-lg border">
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-gray-800 break-words">{item.item_name}</span>
        <span>{codeBadge(item.item_code)}</span>
      </div>
      <div className="flex justify-end gap-2 mt-2 pt-2 border-t">{actionButtons(item)}</div>
    </div>
  );

  const inputClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none";

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 gap-3">
      <div className="flex flex-wrap items-center gap-2 shrink-0 w-full">
        <h2 className="mr-2 text-base font-semibold text-foreground shrink-0">Items Master</h2>

        <FilterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search items by name or code..."
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

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={16} aria-hidden="true" />
            Add Item
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        <DataTable
          ariaLabel="Items"
          emptyTitle="No items found"
          emptyDescription="Add an item or adjust your search."
          headers={HEADERS}
          data={itemsData}
          renderRow={renderRow}
          renderCard={renderCard}
          minWidth="min-w-0"
          currentPage={currentPage}
          totalPages={Math.ceil(totalResults / itemsPerPage) || 1}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
          totalResults={totalResults}
          itemsPerPageOptions={[10, 20, 50]}
        />
      </div>

      <ModalForm
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Add Item"
        onSubmit={handleSubmit}
        submitText={isSaving ? "Adding..." : "Add Item"}
        submitDisabled={isSaving}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="item-field-name" className="block text-sm font-medium text-foreground">Item Name *</label>
            <input
              id="item-field-name"
              type="text"
              required
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="item-field-code" className="block text-sm font-medium text-foreground">Item Code *</label>
            <input
              id="item-field-code"
              type="text"
              required
              value={formData.item_code}
              onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="item-field-unit" className="block text-sm font-medium text-foreground">Unit</label>
            <select
              id="item-field-unit"
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              className={inputClass}
            >
              {ITEM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      </ModalForm>
      {confirmDialog}
    </div>
  );
}

export default Items;
