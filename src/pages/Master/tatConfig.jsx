import React, { useState, useEffect } from "react";
import supabase from "../../utils/supabase";
import { Plus, Pencil, Trash2, Clock, RefreshCw, X, AlertCircle } from "lucide-react";
import {
  daysAndTimeToMinutes,
  minutesToDaysAndHHMM,
  minutesToHHMMSS,
  minutesToDisplayLabel,
} from "../../utils/formatTATDuration";

const STAGE_OPTIONS = [
  "Call-Tracker for Leads",
  "Enquiry Tracker for Leads",
  "Enquiry Tracker for Enquiries",
];

const TatConfig = () => {
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
    tat_time: "01:00",
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
      const { days, hhmm } = minutesToDaysAndHHMM(totalMins);
      setFormData({
        stage_name: item.stage_name || STAGE_OPTIONS[0],
        tat_days: days,
        tat_time: hhmm,
        description: item.description || "",
      });
    } else {
      setIsEditing(false);
      setEditingId(null);
      setFormData({
        stage_name: STAGE_OPTIONS[0],
        tat_days: 0,
        tat_time: "01:00",
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
      tat_time: "01:00",
      description: "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const totalMinutes = daysAndTimeToMinutes(formData.tat_days, formData.tat_time);

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
      alert("Cannot delete: this TAT config has no id.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete TAT configuration for "${stageName}"?`)) {
      return;
    }

    try {
      const { data, error } = await supabase.from("lto_tat_config").delete().eq("id", id).select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This TAT config was already removed (no matching id found).");
      fetchTatConfig();
    } catch (err) {
      console.error("Error deleting TAT config:", err);
      alert("Failed to delete TAT config: " + (err.message || err));
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      {/* Header Bar */}
      <div className="flex-none bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  TAT Configuration
                </h1>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Set and manage Turnaround Time (TAT) in hours and minutes for planned calculation across stages.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchTatConfig}
                className="inline-flex items-center justify-center p-2.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-colors shadow-xs"
                title="Refresh Data"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => handleOpenModal()}
                className="inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-semibold rounded-lg shadow-xs text-white bg-primary hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add TAT Config
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {errorMsg && !isModalOpen && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center gap-3 text-destructive text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm font-medium">Loading TAT Configurations...</p>
            </div>
          ) : tatList.length === 0 ? (
            <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <Clock className="h-10 w-10 text-slate-300" />
              <p className="text-base font-semibold text-slate-700">No TAT Configurations Found</p>
              <p className="text-sm text-slate-500 max-w-md">
                Click "+ Add TAT Config" above to set stage turnaround times for planned calculations.
              </p>
              <button
                onClick={() => handleOpenModal()}
                className="mt-2 inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:opacity-90 transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Add Configuration
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Stage Name
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                      TAT Duration
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Total Minutes
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Description
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {tatList.map((item) => {
                    const totalMins = Number(item.tat_duration) || 0;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-900 text-sm">
                            {item.stage_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/5 text-primary border border-primary/80">
                            <Clock className="h-3 w-3 mr-1.5 text-primary" />
                            {minutesToDisplayLabel(totalMins)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">
                          {minutesToHHMMSS(totalMins)}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">
                          {item.description || <span className="text-slate-300 italic">No notes</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleOpenModal(item)}
                              className="text-primary hover:text-primary p-1.5 rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
                              title="Edit TAT Config"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, item.stage_name)}
                              className="text-destructive hover:text-destructive p-1.5 rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
                              title="Delete TAT Config"
                            >
                              <Trash2 className="h-4 w-4" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 transform transition-all">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-slate-800">
                  {isEditing ? "Edit TAT Configuration" : "Add TAT Configuration"}
                </h3>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-destructive text-xs font-medium">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Stage-Name Dropdown */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Stage Name <span className="text-destructive">*</span>
                </label>
                <select
                  required
                  value={formData.stage_name}
                  onChange={(e) => setFormData({ ...formData, stage_name: e.target.value })}
                  className="w-full rounded-lg border-slate-300 bg-white shadow-xs focus:border-primary focus:ring-primary sm:text-sm p-2.5 border text-slate-800"
                >
                  {STAGE_OPTIONS.map((stage, idx) => (
                    <option key={idx} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Select the stage to associate with this turnaround time.
                </p>
              </div>

              {/* Duration Selection Field (Days + HH:MM time picker) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  TAT Selection (Duration) <span className="text-destructive">*</span>
                </label>
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Days Selector */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Days
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="365"
                          required
                          value={formData.tat_days}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              tat_days: Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          className="w-full rounded-lg border-slate-300 bg-white shadow-xs focus:border-primary focus:ring-primary sm:text-sm p-2 border text-slate-800 pr-12"
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium pointer-events-none">
                          days
                        </span>
                      </div>
                    </div>

                    {/* Hours & Minutes Selector (HH:MM time picker) */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Hours & Minutes (HH:MM)
                      </label>
                      <input
                        type="time"
                        required
                        value={formData.tat_time}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            tat_time: e.target.value || "00:00",
                          })
                        }
                        className="w-full rounded-lg border-slate-300 bg-white shadow-xs focus:border-primary focus:ring-primary sm:text-sm p-2 border text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 flex flex-col gap-1 pt-1 border-t border-slate-200/60">
                    <div className="flex justify-between items-center">
                      <span>Formatted Duration:</span>
                      <span className="font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/20">
                        {minutesToDisplayLabel(daysAndTimeToMinutes(formData.tat_days, formData.tat_time))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>HH:MM:SS Format:</span>
                      <span className="font-mono text-slate-600">
                        {minutesToHHMMSS(daysAndTimeToMinutes(formData.tat_days, formData.tat_time))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Description / Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-lg border-slate-300 bg-white shadow-xs focus:border-primary focus:ring-primary sm:text-sm p-2.5 border text-slate-800"
                  placeholder="Additional context or notes for this TAT rule..."
                />
              </div>

              {/* Form Footer Buttons */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary border border-transparent rounded-lg shadow-xs hover:opacity-90 transition-colors disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
                >
                  {submitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {submitting ? "Saving..." : isEditing ? "Update TAT" : "Save TAT Config"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TatConfig;
