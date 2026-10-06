"use client"

import { useState, useEffect, useContext } from "react"
import { Shield, User, ShieldAlert, Plus, Pencil, Trash2, X, CheckSquare, Square, MapPin, RefreshCw, Eye, EyeOff } from "lucide-react"
import { AuthContext } from "../../App"
import supabase from "../../utils/supabase"
import LoadingSpinner from "../../components/LoadingSpinner"

function Setting() {
  const authContext = useContext(AuthContext) || {}
  const {
    currentUser = null,
    isAdmin = () => false,
    showNotification = () => {}
  } = authContext
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' or 'edit'
  const [editingUsername, setEditingUsername] = useState(null)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    userType: 'user',
    fullName: '',
    restrictedLeadSources: []
  })
  const [employeeOptions, setEmployeeOptions] = useState([])
  const [leadSourceOptions, setLeadSourceOptions] = useState([])
  const [visiblePasswords, setVisiblePasswords] = useState(new Set())
  const [showFormPassword, setShowFormPassword] = useState(false)

  const togglePasswordVisibility = (username) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev)
      next.has(username) ? next.delete(username) : next.add(username)
      return next
    })
  }

  useEffect(() => {
    fetchUsers()
    fetchEmployeeOptions()
    fetchLeadSourceOptions()
  }, [])

  const fetchEmployeeOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('lto_dropdown')
        .select('value')
        .eq('category', 'employees')
        .order('value', { ascending: true })

      if (error) throw error
      setEmployeeOptions((data || []).map(d => d.value).filter(Boolean))
    } catch (error) {
      console.error("Error fetching employee options:", error)
      showNotification("Failed to fetch employee list", "error")
    }
  }

  const fetchLeadSourceOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('lto_dropdown')
        .select('value')
        .eq('category', 'lead_source')
        .order('value', { ascending: true })

      if (error) throw error
      setLeadSourceOptions((data || []).map(d => d.value).filter(Boolean))
    } catch (error) {
      console.error("Error fetching lead source options:", error)
      showNotification("Failed to fetch lead source list", "error")
    }
  }

  const fetchUsers = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('login')
        .select('*')
        .order('username', { ascending: true })

      if (error) throw error
      const normalizedUsers = (data || []).map(u => ({
        ...u,
        userType: u.usertype || u.userType || 'user',
        fullName: u.full_name || u.fullName || '',
        restrictedLeadSources: u.restricted_lead_sources || []
      }))
      setUsers(normalizedUsers)
    } catch (error) {
      console.error("Error fetching users:", error)
      showNotification("Failed to fetch users", "error")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteUser = async (username) => {
    if (username === currentUser.username) {
      showNotification("You cannot delete your own account", "error")
      return
    }

    if (!window.confirm(`Are you sure you want to delete user '${username}'?`)) {
      return
    }

    setIsUpdating(true)
    try {
      const { error } = await supabase
        .from('login')
        .delete()
        .eq('username', username)

      if (error) throw error
      showNotification(`Deleted user ${username}`, "success")
      await fetchUsers()
    } catch (error) {
      console.error("Error deleting user:", error)
      showNotification("Failed to delete user", "error")
    } finally {
      setIsUpdating(false)
    }
  }

  const handleRefresh = () => {
    fetchUsers()
    fetchEmployeeOptions()
    fetchLeadSourceOptions()
  }

  const openAddModal = () => {
    setModalMode('add')
    setFormData({ username: '', password: '', userType: 'user', fullName: '', restrictedLeadSources: [] })
    setShowFormPassword(false)
    setIsModalOpen(true)
  }

  const openEditModal = (user) => {
    setModalMode('edit')
    setShowFormPassword(false)
    setEditingUsername(user.username)
    setFormData({
      username: user.username,
      password: user.password || '',
      userType: user.userType || user.usertype || 'user',
      fullName: user.fullName || user.full_name || '',
      restrictedLeadSources: user.restrictedLeadSources || user.restricted_lead_sources || []
    })
    setIsModalOpen(true)
  }

  // Plain multi-select toggle -- unlike ScDistributionMaster's version there's
  // no "ALL SOURCES" sentinel here: an empty list simply means "not
  // restricted," so no shortcut/mutual-exclusion handling is needed.
  const handleLeadSourceToggle = (option) => {
    setFormData(prev => {
      const current = prev.restrictedLeadSources || [];
      const next = current.includes(option)
        ? current.filter(v => v !== option)
        : [...current, option];
      return { ...prev, restrictedLeadSources: next };
    });
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (!formData.username) {
      showNotification("Username is required", "error")
      return
    }
    if (modalMode === 'add' && !formData.password) {
      showNotification("Password is required for new users", "error")
      return
    }
    if (!formData.fullName) {
      showNotification("Full Name is required", "error")
      return
    }
    if (
      modalMode === 'edit' &&
      editingUsername === currentUser.username &&
      formData.userType !== (isAdmin() ? 'admin' : 'user')
    ) {
      showNotification("You cannot change your own role", "error")
      return
    }

    setIsUpdating(true)
    try {
      if (modalMode === 'add') {
        const { error } = await supabase
          .from('login')
          .insert([{
            username: formData.username,
            password: formData.password,
            usertype: formData.userType,
            full_name: formData.fullName,
            restricted_lead_sources: formData.restrictedLeadSources
          }])
        if (error) throw error
        showNotification("User added successfully", "success")
      } else {
        const updatePayload = {
          username: formData.username,
          usertype: formData.userType,
          full_name: formData.fullName,
          restricted_lead_sources: formData.restrictedLeadSources
        }
        if (formData.password) {
          updatePayload.password = formData.password
        }
        const { error } = await supabase
          .from('login')
          .update(updatePayload)
          .eq('username', editingUsername)
        if (error) throw error
        showNotification("User updated successfully", "success")
      }

      setIsModalOpen(false)
      await fetchUsers()
    } catch (error) {
      console.error("Error saving user:", error)
      showNotification(error.message || "Failed to save user", "error")
    } finally {
      setIsUpdating(false)
    }
  }

  if (!isAdmin()) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full p-8 bg-slate-50">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-md w-full border border-destructive/10">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600">
            You do not have permission to view or manage settings. Only administrators can access this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-slate-50 overflow-auto h-full">
      <div className="max-w-8xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-900 font-semibold text-sm">
            <Shield className="w-4 h-4" />
            User Management
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 bg-primary hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Plus size={16} />
              Add User
            </button>
          </div>
        </div>

        {/* User Management Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <p className="text-sm text-gray-500">Manage user accounts, credentials, and lead-source data access.</p>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {users.length} Active Users
            </span>
          </div>

          <div className="p-0">
            {isLoading ? (
              <div className="p-12">
                <LoadingSpinner fullScreen={false} text="Loading users..." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                    <tr>
                      <th className="px-6 py-4">Actions</th>
                      <th className="px-6 py-4">Full Name</th>
                      <th className="px-6 py-4">Username</th>
                      <th className="px-6 py-4">Password</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Data Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((user) => {
                      const isSelf = user.username === currentUser.username
                      const isPasswordVisible = visiblePasswords.has(user.username)
                      return (
                        <tr key={user.username} className="hover:bg-primary/5 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => openEditModal(user)}
                                className="text-info hover:text-info transition-colors p-1"
                                title="Edit User"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.username)}
                                disabled={isSelf}
                                className="text-destructive hover:text-destructive transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={isSelf ? "You cannot delete your own account" : "Delete User"}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                            {user.fullName || <span className="text-slate-400 font-normal">No Full Name set</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-700 font-mono text-xs">
                            {user.username}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-600">
                                {isPasswordVisible ? (user.password || "") : "•".repeat(Math.max(6, (user.password || "").length))}
                              </span>
                              <button
                                onClick={() => togglePasswordVisibility(user.username)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                title={isPasswordVisible ? "Hide password" : "Show password"}
                              >
                                {isPasswordVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {user.userType === 'admin' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-white">
                                <Shield className="w-3.5 h-3.5" />
                                Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                <User className="w-3.5 h-3.5" />
                                User
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {user.userType === 'admin' ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                All Records (Full Access)
                              </span>
                            ) : user.restrictedLeadSources && user.restrictedLeadSources.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {user.restrictedLeadSources.map((src) => (
                                  <span key={src} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                    <MapPin className="w-3 h-3" />
                                    {src}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Own records (by name)</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800">
                        {modalMode === 'add' ? 'Add New User' : 'Edit User'}
                    </h3>
                    <button 
                        onClick={() => setIsModalOpen(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors rounded-full p-1 hover:bg-slate-200"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                            <input
                                type="text"
                                value={formData.username}
                                onChange={(e) => setFormData({...formData, username: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-shadow"
                                placeholder="e.g. jdoe"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                            <select
                                value={formData.fullName}
                                onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-shadow bg-white"
                                required
                            >
                                <option value="" disabled>Select employee</option>
                                {employeeOptions.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 -mt-2">
                        Full Name must match the "SC Assigned" name on leads/enquiries so this user only sees records assigned to them.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Password
                                {modalMode === 'edit' && <span className="text-slate-400 font-normal ml-1">(optional)</span>}
                            </label>
                            <div className="relative">
                                <input
                                    type={showFormPassword ? "text" : "password"}
                                    value={formData.password}
                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                    className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-shadow"
                                    placeholder={modalMode === 'edit' ? "Enter new password" : "Enter password"}
                                    required={modalMode === 'add'}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowFormPassword(v => !v)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    title={showFormPassword ? "Hide password" : "Show password"}
                                >
                                    {showFormPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {modalMode === 'edit' && (
                                <p className="text-xs text-slate-400 mt-1">Leave blank to keep the current password.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                            <select
                                value={formData.userType}
                                onChange={(e) => setFormData({...formData, userType: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-shadow bg-white"
                            >
                                <option value="user">User (Assigned Access Only)</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                    </div>

                    {formData.userType !== 'admin' && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-slate-700">
                                    Restrict to Lead Source(s)
                                </label>
                                <span className="text-xs text-slate-400">Optional</span>
                            </div>
                            <p className="text-xs text-slate-400 mb-2">
                                Leave unchecked to use the normal "own name" access above. If you check
                                any source(s) here, this user will instead see EVERY record tagged with
                                that source, regardless of who it's assigned to.
                            </p>
                            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 max-h-40 overflow-y-auto">
                                {leadSourceOptions.length === 0 ? (
                                    <span className="text-xs text-slate-400 col-span-2">No lead sources configured yet.</span>
                                ) : leadSourceOptions.map((opt) => {
                                    const checked = (formData.restrictedLeadSources || []).includes(opt);
                                    return (
                                        <label
                                            key={opt}
                                            onClick={() => handleLeadSourceToggle(opt)}
                                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer border text-xs font-medium transition-all ${
                                                checked
                                                    ? "bg-white text-slate-900 border-slate-300 shadow-sm font-bold"
                                                    : "bg-transparent text-slate-500 border-transparent hover:bg-white/50"
                                            }`}
                                        >
                                            {checked ? <CheckSquare className="w-4 h-4 text-primary shrink-0" /> : <Square className="w-4 h-4 text-slate-300 shrink-0" />}
                                            <span className="truncate">{opt}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="pt-4 mt-6 border-t border-slate-100 flex justify-end gap-3">
                        <button 
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={isUpdating}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:opacity-90 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center"
                        >
                            {isUpdating ? 'Saving...' : 'Save User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  )
}

export default Setting
