import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../../App";
import useConfirmDialog from "../../components/useConfirmDialog";
import supabase from "../../utils/supabase";
import MasterDialog from "../../components/MasterDialog";
import { Plus, Pencil, Trash2, Clock, RefreshCw, AlertCircle } from "lucide-react";
import {
  daysHoursMinutesToMinutes,
  minutesToDaysHoursMinutes,
  minutesToHHMMSS,
  minutesToDisplayLabel,
} from "../../utils/formatTATDuration";

const STAGE_OPTIONS = [
  "Call-Tracker for Leads",
  "Enquiry Tracker for Leads",
  "Enquiry Tracker for Enquiries",
];

const TatConfig = () => {
  const { showNotification = () => {} } = useContext(AuthContext) || {};
  const { askConfirm, confirmDialog } = useConfirmDialog();
  const [tatList, setTatList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    stage_name: STAGE_OPTIONS[0],
    tat_days: 0,
    tat_hours: 1,
    tat_minutes: 0,
    description: "",
  });

  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetchTatConfig();
  }, []);

  const fetchTatConfig = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const { data, error } = await supabase
        .from("lto_tat_config")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setTatList(data || []);
    } catch (err) {
      console.error("Error fetching TAT config:", err);
      setErrorMsg(err.message || "Failed to load TAT configuration data.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (item = null) => {
    setErrorMsg("");
    if (item) {
      setIsEditing(true);
      setEditingId(item.id);
      const totalMins = Number(item.tat_duration) || 0;
      const { days, hours, minutes } = minutesToDaysHoursMinutes(totalMins);
      setFormData({
        stage_name: item.stage_name || STAGE_OPTIONS[0],
        tat_days: days,
        tat_hours: hours,
        tat_minutes: minutes,
        description: item.description || "",
      });
    } else {
      setIsEditing(false);
      setEditingId(null);
      setFormData({
        stage_name: STAGE_OPTIONS[0],
        tat_days: 0,
        tat_hours: 1,
        tat_minutes: 0,
        description: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setErrorMsg("");
    setFormData({
      stage_name: STAGE_OPTIONS[0],
      tat_days: 0,
      tat_hours: 1,
      tat_minutes: 0,
      description: "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const totalMinutes = daysHoursMinutesToMinutes(
      formData.tat_days,
      formData.tat_hours,
      formData.tat_minutes
    );

    if (!formData.stage_name) {
      setErrorMsg("Please select a Stage Name.");
      return;
    }

    if (totalMinutes <= 0) {
      setErrorMsg("Turnaround time (TAT duration) must be greater than 0 minutes.");
      return;
    }

    if (isEditing && !editingId) {
      setErrorMsg("Cannot save: this TAT config has no id. Please refresh and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        stage_name: formData.stage_name,
        tat_duration: totalMinutes,
        description: formData.description?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (isEditing) {
        const { data: existing, error: checkError } = await supabase
          .from("lto_tat_config")
          .select("id")
          .eq("id", editingId)
          .maybeSingle();
        if (checkError) throw checkError;
        if (!existing) {
          throw new Error("This TAT config no longer exists in the database (it may have been deleted). Please refresh.");
        }

        const { data, error } = await supabase
          .from("lto_tat_config")
          .update(payload)
          .eq("id", editingId)
          .select()
          .single();

        if (error) throw error;
        if (!data) throw new Error("Update did not affect any row.");
      } else {
        const { data, error } = await supabase
          .from("lto_tat_config")
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        if (!data) throw new Error("Insert did not return the new row.");
      }

      handleCloseModal();
      fetchTatConfig();
    } catch (err) {
      console.error("Error saving TAT config:", err);
      setErrorMsg(err.message || "Failed to save TAT configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, stageName) => {
    if (!id) {
      showNotification("Cannot delete: this TAT config has no id.", "error");
      return;
    }
    askConfirm({ title: "Delete TAT configuration?", message: `Are you sure you want to delete TAT configuration for "${stageName}"?`, confirmText: "Delete" }, async () => {
      try {
        const { data, error } = await supabase.from("lto_tat_config").delete().eq("id", id).select().maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("This TAT config was already removed (no matching id found).");
        fetchTatConfig();
      } catch (err) {
        console.error("Error deleting TAT config:", err);
        showNotification("Failed to delete TAT config: " + (err.message || err), "error");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            TAT Configuration
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Set and manage Turnaround Time (TAT) in hours and minutes for planned calculation across stages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchTatConfig}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Refresh TAT configurations"
            title="Refresh Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add TAT Config
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-3">
        {errorMsg && !isModalOpen && (
          <div role="alert" className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="rounded-lg border bg-card overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2" role="status">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-medium">Loading TAT Configurations...</p>
            </div>
          ) : tatList.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
              <Clock className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <p className="text-base font-semibold text-foreground">No TAT Configurations Found</p>
              <p className="text-sm text-muted-foreground max-w-md">
                Click "+ Add TAT Config" above to set stage turnaround times for planned calculations.
              </p>
              <button
                onClick={() => handleOpenModal()}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Configuration
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full" aria-label="TAT configurations">
                <thead className="bg-secondary">
                  <tr>
                    <th scope="col" className="border-b px-4 py-2.5 text-left text-xs font-semibold text-brand-800">
                      Stage Name
                    </th>
                    <th scope="col" className="border-b px-4 py-2.5 text-left text-xs font-semibold text-brand-800">
                      TAT Duration
                    </th>
                    <th scope="col" className="border-b px-4 py-2.5 text-left text-xs font-semibold text-brand-800">
                      Total Minutes
                    </th>
                    <th scope="col" className="border-b px-4 py-2.5 text-left text-xs font-semibold text-brand-800">
                      Description
                    </th>
                    <th scope="col" className="border-b px-4 py-2.5 text-right text-xs font-semibold text-brand-800">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y">
                  {tatList.map((item) => {
                    const totalMins = Number(item.tat_duration) || 0;

                    return (
                      <tr key={item.id} className="hover:bg-secondary/60 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold text-foreground text-sm">
                            {item.stage_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-accent text-brand-800 border border-primary/30">
                            <Clock className="h-3 w-3 mr-1.5 text-primary" aria-hidden="true" />
                            {minutesToDisplayLabel(totalMins)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground font-mono">
                          {minutesToHHMMSS(totalMins)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                          {item.description || <span className="italic">No notes</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenModal(item)}
                              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-info hover:bg-accent"
                              aria-label={`Edit ${item.stage_name}`}
                              title="Edit TAT Config"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id, item.stage_name)}
                              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-destructive hover:bg-destructive/10"
                              aria-label={`Delete ${item.stage_name}`}
                              title="Delete TAT Config"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Popup Dialog Form Modal */}
      {isModalOpen && (
        <MasterDialog
          title={isEditing ? "Edit TAT Configuration" : "Add TAT Configuration"}
          onClose={handleCloseModal}
          maxWidth="max-w-lg"
        >
            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {errorMsg && (
                <div role="alert" className="p-3 rounded-md bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-destructive text-xs font-medium">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Stage-Name Dropdown */}
              <div>
                <label htmlFor="tat-stage" className="block text-sm font-medium text-foreground mb-1.5">
                  Stage Name <span className="text-destructive">*</span>
                </label>
                <select
                  id="tat-stage"
                  required
                  value={formData.stage_name}
                  onChange={(e) => setFormData({ ...formData, stage_name: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                >
                  {STAGE_OPTIONS.map((stage, idx) => (
                    <option key={idx} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select the stage to associate with this turnaround time.
                </p>
              </div>

              {/* Duration Selection Field (Days, Hours, Minutes) */}
              <div>
                <p className="block text-sm font-medium text-foreground mb-1.5">
                  TAT Selection (Duration) <span className="text-destructive">*</span>
                </p>
                <div className="p-4 rounded-lg border bg-secondary/50 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {/* Days Selector */}
                    <div>
                      <label htmlFor="tat-days" className="block text-xs font-medium text-muted-foreground mb-1">
                        Days
                      </label>
                      <div className="relative">
                        <input
                          id="tat-days"
                          type="number"
                          min="0"
                          max="365"
                          value={formData.tat_days}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              tat_days: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none pr-12"
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-medium pointer-events-none">
                          days
                        </span>
                      </div>
                    </div>

                    {/* Hours Selector */}
                    <div>
                      <label htmlFor="tat-hours" className="block text-xs font-medium text-muted-foreground mb-1">
                        Hours
                      </label>
                      <div className="relative">
                        <input
                          id="tat-hours"
                          type="number"
                          min="0"
                          max="23"
                          value={formData.tat_hours}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              tat_hours: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none pr-10"
                          placeholder="0"
                        />
                        <span className="absolute right-2.5 top-2.5 text-xs text-muted-foreground font-medium pointer-events-none">
                          hrs
                        </span>
                      </div>
                    </div>

                    {/* Minutes Selector */}
                    <div>
                      <label htmlFor="tat-minutes" className="block text-xs font-medium text-muted-foreground mb-1">
                        Minutes
                      </label>
                      <div className="relative">
                        <input
                          id="tat-minutes"
                          type="number"
                          min="0"
                          max="59"
                          value={formData.tat_minutes}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              tat_minutes: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none pr-11"
                          placeholder="0"
                        />
                        <span className="absolute right-2.5 top-2.5 text-xs text-muted-foreground font-medium pointer-events-none">
                          mins
                        </span>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const currentTotalMinutes = daysHoursMinutesToMinutes(
                      formData.tat_days,
                      formData.tat_hours,
                      formData.tat_minutes
                    );
                    return (
                      <div className="text-xs text-muted-foreground flex flex-col gap-1 pt-1 border-t">
                        <div className="flex justify-between items-center">
                          <span>Formatted Duration:</span>
                          <span className="font-semibold text-brand-800 bg-accent px-2 py-0.5 rounded border border-primary/20">
                            {minutesToDisplayLabel(currentTotalMinutes)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                          <span>HH:MM:SS Format:</span>
                          <span className="font-mono text-foreground">
                            {minutesToHHMMSS(currentTotalMinutes)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label htmlFor="tat-notes" className="block text-sm font-medium text-foreground mb-1.5">
                  Description / Notes <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <textarea
                  id="tat-notes"
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Additional context or notes for this TAT rule..."
                />
              </div>

              {/* Form Footer Buttons */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={submitting}
                  className="h-9 px-4 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {submitting && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {submitting ? "Saving..." : isEditing ? "Update TAT" : "Save TAT Config"}
                </button>
              </div>
            </form>
        </MasterDialog>
      )}
      {confirmDialog}
    </div>
  );
};

export default TatConfig;
