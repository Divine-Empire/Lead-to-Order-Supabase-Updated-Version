"use client"

import { useState, useEffect, useContext } from "react"
import { Shield, User, ShieldAlert, Plus, Pencil, Trash2, CheckSquare, Square, MapPin, RefreshCw, Eye, EyeOff } from "lucide-react"
import { AuthContext } from "../../App"
import supabase from "../../utils/supabase"
import LoadingSpinner from "../../components/LoadingSpinner"
import MasterDialog from "../../components/MasterDialog"
import useConfirmDialog from "../../components/useConfirmDialog"
import ModalView from "../../components/ModalView"
import { FilterSearch } from "../../components/FilterBar"

function Setting() {
  const authContext = useContext(AuthContext) || {}
  const {
    currentUser = null,
    isAdmin = () => false,
    showNotification = () => {}
  } = authContext
  const { askConfirm, confirmDialog } = useConfirmDialog()
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
    restrictedLeadSources: [],
    fosAlternateAccess: []
  })
  // Names seen as receiver / assigned person on enquiries and leads (FOS Enquiries picker)
  const [fosNameOptions, setFosNameOptions] = useState([])
  const [fosNameQuery, setFosNameQuery] = useState('')
  const [employeeOptions, setEmployeeOptions] = useState([])
  const [leadSourceOptions, setLeadSourceOptions] = useState([])
  const [visiblePasswords, setVisiblePasswords] = useState(new Set())
  const [userSearch, setUserSearch] = useState('')
  const [accessUser, setAccessUser] = useState(null) // user whose Data Access is open in the view dialog
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
    fetchFosNames()
  }, [])

  const fetchFosNames = async () => {
    try {
      const { data, error } = await supabase.rpc('lto_fos_person_names')
      if (error) throw error
      setFosNameOptions(data || [])
    } catch (error) {
      console.error("Error fetching FOS person names:", error)
    }
  }

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
        restrictedLeadSources: u.restricted_lead_sources || [],
        fosAlternateAccess: u.fos_alternate_access || []
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

    askConfirm({
      title: "Delete user?",
      message: `Are you sure you want to delete user '${username}'?`,
      confirmText: "Delete",
    }, async () => {
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
    })
  }

  const handleRefresh = () => {
    fetchUsers()
    fetchEmployeeOptions()
    fetchLeadSourceOptions()
  }

  const openAddModal = () => {
    setModalMode('add')
    setFormData({ username: '', password: '', userType: 'user', fullName: '', restrictedLeadSources: [], fosAlternateAccess: [] })
    setFosNameQuery('')
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
      restrictedLeadSources: user.restrictedLeadSources || user.restricted_lead_sources || [],
      fosAlternateAccess: user.fosAlternateAccess || user.fos_alternate_access || []
    })
    setFosNameQuery('')
    setIsModalOpen(true)
  }

  const handleFosNameToggle = (name) => {
    setFormData(prev => {
      const current = prev.fosAlternateAccess || []
      return {
        ...prev,
        fosAlternateAccess: current.includes(name) ? current.filter(v => v !== name) : [...current, name]
      }
    })
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
            restricted_lead_sources: formData.restrictedLeadSources,
            fos_alternate_access: formData.userType === 'admin' ? [] : formData.fosAlternateAccess
          }])
        if (error) throw error
        showNotification("User added successfully", "success")
      } else {
        const updatePayload = {
          username: formData.username,
          usertype: formData.userType,
          full_name: formData.fullName,
          restricted_lead_sources: formData.restrictedLeadSources,
          fos_alternate_access: formData.userType === 'admin' ? [] : formData.fosAlternateAccess
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
      <div className="flex-1 flex flex-col items-center justify-center h-full p-8">
        <div className="bg-card p-8 rounded-lg text-center max-w-md w-full border">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8 text-destructive" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            You do not have permission to view or manage settings. Only administrators can access this page.
          </p>
        </div>
      </div>
    )
  }

  const query = userSearch.trim().toLowerCase()
  const visibleUsers = query
    ? users.filter((u) => `${u.fullName || ''} ${u.username || ''}`.toLowerCase().includes(query))
    : users

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
            User Management
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage user accounts, credentials, and lead-source data access.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSearch
            value={userSearch}
            onChange={setUserSearch}
            placeholder="Search by full name or username..."
            className="!flex-none w-full sm:w-72"
          />
          <span className="inline-flex h-7 items-center rounded-full border bg-secondary px-3 text-xs font-medium text-foreground tabular-nums">
            {userSearch.trim() ? `${visibleUsers.length} of ${users.length}` : users.length} Active Users
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={16} aria-hidden="true" />
            Add User
          </button>
        </div>
      </div>

      {/* User Management Section */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-12">
            <LoadingSpinner fullScreen={false} text="Loading users..." />
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-left text-sm" aria-label="Users">
            <thead className="sticky top-0 z-10 bg-secondary">
              <tr className="text-xs font-semibold text-brand-800">
                <th scope="col" className="border-b bg-secondary px-4 py-2.5">Actions</th>
                <th scope="col" className="border-b bg-secondary px-4 py-2.5">Full Name</th>
                <th scope="col" className="border-b bg-secondary px-4 py-2.5">Username</th>
                <th scope="col" className="border-b bg-secondary px-4 py-2.5">Password</th>
                <th scope="col" className="border-b bg-secondary px-4 py-2.5">Role</th>
                <th scope="col" className="border-b bg-secondary px-4 py-2.5">Data Access</th>
              </tr>
            </thead>
            <tbody className="bg-card">
              {visibleUsers.map((user) => {
                const isSelf = user.username === currentUser.username
                const isPasswordVisible = visiblePasswords.has(user.username)
                return (
                  <tr key={user.username} className="hover:bg-secondary/60 transition-colors">
                    <td className="whitespace-nowrap border-b px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-info hover:bg-accent"
                          aria-label={`Edit ${user.username}`}
                          title="Edit User"
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user.username)}
                          disabled={isSelf}
                          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Delete ${user.username}`}
                          title={isSelf ? "You cannot delete your own account" : "Delete User"}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-b px-4 py-3 font-medium text-foreground">
                      {user.fullName || <span className="font-normal text-muted-foreground">No Full Name set</span>}
                    </td>
                    <td className="whitespace-nowrap border-b px-4 py-3 font-mono text-xs text-foreground">
                      {user.username}
                    </td>
                    <td className="whitespace-nowrap border-b px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-muted-foreground">
                          {isPasswordVisible ? (user.password || "") : "•".repeat(Math.max(6, (user.password || "").length))}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(user.username)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          aria-label={isPasswordVisible ? `Hide password for ${user.username}` : `Show password for ${user.username}`}
                          aria-pressed={isPasswordVisible}
                          title={isPasswordVisible ? "Hide password" : "Show password"}
                        >
                          {isPasswordVisible ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-b px-4 py-3">
                      {user.userType === 'admin' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                          <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                          <User className="h-3.5 w-3.5" aria-hidden="true" />
                          User
                        </span>
                      )}
                    </td>
                    <td className="border-b px-4 py-3">
                      {user.userType === 'admin' ? (
                        <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                          All Records (Full Access)
                        </span>
                      ) : (user.restrictedLeadSources && user.restrictedLeadSources.length > 0) || (user.fosAlternateAccess && user.fosAlternateAccess.length > 0) ? (
                        <button
                          type="button"
                          onClick={() => setAccessUser(user)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                          aria-label={`View data access for ${user.username}`}
                        >
                          <Eye size={14} aria-hidden="true" />
                          View
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Own records (by name)</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {visibleUsers.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-muted-foreground">
                    {users.length === 0 ? 'No users found.' : 'No users match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <ModalView
        isOpen={Boolean(accessUser)}
        onClose={() => setAccessUser(null)}
        title={accessUser ? `Data Access - ${accessUser.fullName || accessUser.username}` : ''}
        maxWidth="max-w-xl"
      >
        {accessUser && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-1.5 font-medium text-foreground">Lead sources</p>
              {accessUser.restrictedLeadSources && accessUser.restrictedLeadSources.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {accessUser.restrictedLeadSources.map((src) => (
                    <span key={src} className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-xs font-medium text-foreground">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {src}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Own records (by name)</p>
              )}
            </div>
            {accessUser.fosAlternateAccess && accessUser.fosAlternateAccess.length > 0 && (
              <div>
                <p className="mb-1.5 font-medium text-foreground">FOS Enquiries: also sees</p>
                <div className="flex flex-wrap gap-1">
                  {accessUser.fosAlternateAccess.map((p) => (
                    <span key={p} className="inline-flex items-center rounded-full border bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ModalView>

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <MasterDialog
          title={modalMode === 'add' ? 'Add New User' : 'Edit User'}
          onClose={() => setIsModalOpen(false)}
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleFormSubmit} className="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="user-username" className="mb-1 block text-sm font-medium text-foreground">Username</label>
                <input
                  id="user-username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  placeholder="e.g. jdoe"
                  required
                />
              </div>
              <div>
                <label htmlFor="user-fullname" className="mb-1 block text-sm font-medium text-foreground">Full Name</label>
                <select
                  id="user-fullname"
                  value={formData.fullName}
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                  required
                >
                  <option value="" disabled>Select employee</option>
                  {employeeOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Full Name must match the "SC Assigned" name on leads/enquiries so this user only sees records assigned to them.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="user-password" className="mb-1 block text-sm font-medium text-foreground">
                  Password
                  {modalMode === 'edit' && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
                </label>
                <div className="relative">
                  <input
                    id="user-password"
                    type={showFormPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none pr-10"
                    placeholder={modalMode === 'edit' ? "Enter new password" : "Enter password"}
                    required={modalMode === 'add'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormPassword(v => !v)}
                    className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={showFormPassword ? "Hide password" : "Show password"}
                    aria-pressed={showFormPassword}
                    title={showFormPassword ? "Hide password" : "Show password"}
                  >
                    {showFormPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
                {modalMode === 'edit' && (
                  <p className="mt-1 text-xs text-muted-foreground">Leave blank to keep the current password.</p>
                )}
              </div>
              <div>
                <label htmlFor="user-role" className="mb-1 block text-sm font-medium text-foreground">Role</label>
                <select
                  id="user-role"
                  value={formData.userType}
                  onChange={(e) => setFormData({...formData, userType: e.target.value})}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="user">User (Assigned Access Only)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {formData.userType !== 'admin' && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Restrict to Lead Source(s)</p>
                  <span className="text-xs text-muted-foreground">Optional</span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Leave unchecked to use the normal "own name" access above. If you check
                  any source(s) here, this user will instead see EVERY record tagged with
                  that source, regardless of who it's assigned to.
                </p>
                <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-lg border bg-secondary/50 p-3">
                  {leadSourceOptions.length === 0 ? (
                    <span className="col-span-2 text-xs text-muted-foreground">No lead sources configured yet.</span>
                  ) : leadSourceOptions.map((opt) => {
                    const checked = (formData.restrictedLeadSources || []).includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => handleLeadSourceToggle(opt)}
                        className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs font-medium transition-colors ${
                          checked
                            ? "border-primary/40 bg-card font-semibold text-foreground"
                            : "border-transparent bg-transparent text-muted-foreground hover:bg-card"
                        }`}
                      >
                        {checked ? <CheckSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : <Square className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                        <span className="truncate">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {formData.userType !== 'admin' && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">FOS Enquiries: also show records of</p>
                  <span className="text-xs text-muted-foreground">
                    {(formData.fosAlternateAccess || []).length > 0 ? `${formData.fosAlternateAccess.length} selected` : 'Optional'}
                  </span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  For a HOD: pick the people whose enquiries (as Enquiry Receiver or Assigned Person) this user should also see in the
                  FOS Enquiries stage. This applies to FOS Enquiries only.
                </p>
                <input
                  type="text"
                  value={fosNameQuery}
                  onChange={(e) => setFosNameQuery(e.target.value)}
                  placeholder="Search name"
                  aria-label="Search person"
                  className="mb-2 h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:border-primary focus:outline-none"
                />
                <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-lg border bg-secondary/50 p-2 sm:grid-cols-2">
                  {(() => {
                    const selected = formData.fosAlternateAccess || []
                    const q = fosNameQuery.trim().toUpperCase()
                    const names = [...new Set([...selected, ...fosNameOptions])]
                    // Selected people first, then the rest alphabetically; the search narrows both.
                    const shown = names
                      .filter((n) => !q || n.includes(q))
                      .sort((a, b) => (selected.includes(b) ? 1 : 0) - (selected.includes(a) ? 1 : 0) || a.localeCompare(b))
                    if (shown.length === 0) {
                      return <span className="col-span-2 p-1 text-xs text-muted-foreground">{fosNameOptions.length === 0 ? 'No names found yet.' : 'No match.'}</span>
                    }
                    return shown.map((name) => {
                      const checked = selected.includes(name)
                      return (
                        <button
                          key={name}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => handleFosNameToggle(name)}
                          className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs font-medium transition-colors ${
                            checked
                              ? "border-primary/40 bg-card font-semibold text-foreground"
                              : "border-transparent bg-transparent text-muted-foreground hover:bg-card"
                          }`}
                        >
                          {checked ? <CheckSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : <Square className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                          <span className="truncate">{name}</span>
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="h-9 px-4 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdating}
                className="h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUpdating ? 'Saving...' : 'Save User'}
              </button>
            </div>
          </form>
        </MasterDialog>
      )}
      {confirmDialog}
    </div>
  )
}

export default Setting
