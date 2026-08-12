"use client"

import { useState, useEffect, useContext } from "react"
import { Shield, User, ShieldAlert, Check, Plus, Pencil, Trash2, X } from "lucide-react"
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
    fullName: ''
  })
  const [employeeOptions, setEmployeeOptions] = useState([])

  useEffect(() => {
    fetchUsers()
    fetchEmployeeOptions()
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
        fullName: u.full_name || u.fullName || ''
      }))
      setUsers(normalizedUsers)
    } catch (error) {
      console.error("Error fetching users:", error)
      showNotification("Failed to fetch users", "error")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoleUpdate = async (username, newRole) => {
    if (username === currentUser.username) {
      showNotification("You cannot change your own role", "error")
      return
    }

    setIsUpdating(true)
    try {
      const { error } = await supabase
        .from('login')
        .update({ usertype: newRole })
        .eq('username', username)

      if (error) throw error
      showNotification(`Updated ${username} to ${newRole}`, "success")
      await fetchUsers()
    } catch (error) {
      console.error("Error updating role:", error)
      showNotification("Failed to update user role", "error")
    } finally {
      setIsUpdating(false)
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

  const openAddModal = () => {
    setModalMode('add')
    setFormData({ username: '', password: '', userType: 'user', fullName: '' })
    setIsModalOpen(true)
  }

  const openEditModal = (user) => {
    setModalMode('edit')
    setEditingUsername(user.username)
    setFormData({
      username: user.username,
      password: user.password || '',
      userType: user.userType || user.usertype || 'user',
      fullName: user.fullName || user.full_name || ''
    })
    setIsModalOpen(true)
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

    setIsUpdating(true)
    try {
      if (modalMode === 'add') {
        const { error } = await supabase
          .from('login')
          .insert([{
            username: formData.username,
            password: formData.password,
            usertype: formData.userType,
            full_name: formData.fullName
          }])
        if (error) throw error
        showNotification("User added successfully", "success")
      } else {
        const updatePayload = {
          username: formData.username,
          usertype: formData.userType,
          full_name: formData.fullName
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
    <div className="flex-1 p-6 md:p-8 bg-slate-50 overflow-auto h-full">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Settings & Access Control
          </h1>
          <p className="text-gray-500 mt-1">Manage user roles and permissions across the application.</p>
        </div>

        {/* User Management Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
                <h2 className="text-lg font-semibold text-gray-800">User Management</h2>
                <p className="text-sm text-gray-500">View registered users and assign administrator privileges.</p>
            </div>
            <button 
                onClick={openAddModal}
                className="flex items-center gap-2 bg-primary hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
                <Plus size={16} />
                Add User
            </button>
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
                      <th className="px-6 py-4">User</th>
                      <th className="px-6 py-4">Current Role</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((user) => (
                      <tr key={user.username} className="hover:bg-primary/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center text-primary font-bold border border-primary/20">
                              {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{user.username}</div>
                              <div className="text-xs text-gray-500">{user.fullName || "No Full Name set"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.userType === 'admin' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                              <Shield className="w-3.5 h-3.5" />
                              Administrator
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                              <User className="w-3.5 h-3.5" />
                              Standard User
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-3">
                              {user.username === currentUser.username ? (
                                <span className="inline-flex items-center text-sm text-gray-400 bg-gray-50 px-3 py-1.5 rounded-md">
                                  <Check className="w-4 h-4 mr-1.5" /> Current User
                                </span>
                              ) : (
                                <>
                                    <select
                                    value={user.userType}
                                    disabled={isUpdating}
                                    onChange={(e) => handleRoleUpdate(user.username, e.target.value)}
                                    className="bg-white border border-slate-300 text-slate-700 text-sm rounded-md focus:ring-primary focus:border-primary px-3 py-1.5 shadow-sm disabled:opacity-50 outline-none cursor-pointer hover:border-primary/40 transition-colors"
                                    >
                                    <option value="user">Standard User</option>
                                    <option value="admin">Administrator</option>
                                    </select>
                                    
                                    <button 
                                        onClick={() => openEditModal(user)}
                                        className="text-info hover:text-info transition-colors p-1" 
                                        title="Edit User"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteUser(user.username)}
                                        className="text-destructive hover:text-destructive transition-colors p-1" 
                                        title="Delete User"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan="3" className="px-6 py-8 text-center text-gray-500">
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
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
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                        <input 
                            type="text"
                            value={formData.username}
                            onChange={(e) => setFormData({...formData, username: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-shadow"
                            placeholder="Enter username"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Password
                            {modalMode === 'edit' && <span className="text-slate-400 font-normal ml-2">(Leave blank to keep unchanged)</span>}
                        </label>
                        <input 
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({...formData, password: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-shadow"
                            placeholder={modalMode === 'edit' ? "Enter new password" : "Enter password"}
                            required={modalMode === 'add'}
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
                        <p className="text-xs text-slate-400 mt-1">
                            Must match the "SC Assigned" name on leads/enquiries so this user only sees records assigned to them.
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                        <select
                            value={formData.userType}
                            onChange={(e) => setFormData({...formData, userType: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-shadow bg-white"
                        >
                            <option value="user">Standard User</option>
                            <option value="admin">Administrator</option>
                        </select>
                    </div>

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
