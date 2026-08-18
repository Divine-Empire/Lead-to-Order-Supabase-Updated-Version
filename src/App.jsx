"use client"

import { useState, useEffect, createContext } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import Login from "./pages/auth/Login"
import Dashboard from "./pages/dashboard/Dashboard"
import Leads from "./pages/leads/Leads"
import CallTracker from "./pages/call-tracker/CallTracker"
import CallTrackerForm from "./pages/call-tracker/CallTrackerForm"
import EnquiryTracker from "./pages/enquiry-tracker/EnquiryTracker"
import EnquiryTrackerForm from "./pages/enquiry-tracker/EnquiryTrackerForm"
import Quotation from "./pages/Quotation/Quotation"
import Report from "./pages/report/Report"
import MainNav from "./components/MainNav"
import Footer from "./components/Footer"
import Notification from "./components/Notification"
import Sidebar from "./components/Sidebar"
import Master from "./pages/Master/Master"
import Setting from "./pages/Setting/Setting"
import supabase from "./utils/supabase"

// Create auth context
export const AuthContext = createContext(null)
// Create data context to manage data access based on user type
export const DataContext = createContext(null)

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("isAuthenticated") === "true"
  })
  const [notifications, setNotifications] = useState([])
  const [currentUser, setCurrentUser] = useState(() => {
    const storedUser = localStorage.getItem("currentUser")
    return storedUser ? JSON.parse(storedUser) : null
  })
  const [userType, setUserType] = useState(() => {
    return localStorage.getItem("userType") || null
  })
  const [userData, setUserData] = useState(null)
  const [alternateAccess, setAlternateAccess] = useState(() => {
    return localStorage.getItem("alternateAccess") || null
  })
  // If non-empty, this account is scoped by lead_source instead of by name
  // (own Full Name + alternate_access) -- see getLeadSourcesToFilter below.
  const [restrictedLeadSources, setRestrictedLeadSources] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("restrictedLeadSources") || "[]")
    } catch {
      return []
    }
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Check if user is already logged in and fetch latest alternate_access from database
  useEffect(() => {
    const auth = localStorage.getItem("isAuthenticated")
    const storedUser = localStorage.getItem("currentUser")
    const storedUserType = localStorage.getItem("userType")

    if (auth === "true" && storedUser) {
      const parsedUser = JSON.parse(storedUser)
      setIsAuthenticated(true)
      setCurrentUser(parsedUser)
      setUserType(storedUserType)

      // Fetch latest alternate_access + full_name + restricted_lead_sources
      // from database to ensure it's always up-to-date
      const fetchLatestAlternateAccess = async () => {
        try {
          const { data, error } = await supabase
            .from('login')
            .select('alternate_access, full_name, restricted_lead_sources')
            .eq('username', parsedUser.username)
            .single()

          if (!error && data) {
            const latestAlternateAccess = data.alternate_access || null
            const latestFullName = data.full_name || parsedUser.fullName || null
            const latestRestrictedLeadSources = data.restricted_lead_sources || []
            setAlternateAccess(latestAlternateAccess)
            setRestrictedLeadSources(latestRestrictedLeadSources)
            setCurrentUser(prev => ({ ...(prev || parsedUser), fullName: latestFullName }))
            localStorage.setItem("alternateAccess", latestAlternateAccess || '')
            localStorage.setItem("restrictedLeadSources", JSON.stringify(latestRestrictedLeadSources))
            localStorage.setItem("currentUser", JSON.stringify({ ...parsedUser, fullName: latestFullName }))
            // Fetch data with latest alternate_access, scoped by full_name (matches SC Assigned)
            fetchUserData(latestFullName, storedUserType, latestAlternateAccess, latestRestrictedLeadSources)
          } else {
            // Fallback to stored value if database fetch fails
            const storedAlternateAccess = localStorage.getItem("alternateAccess")
            let storedRestrictedLeadSources = []
            try { storedRestrictedLeadSources = JSON.parse(localStorage.getItem("restrictedLeadSources") || "[]") } catch { /* keep [] */ }
            setAlternateAccess(storedAlternateAccess || null)
            setRestrictedLeadSources(storedRestrictedLeadSources)
            fetchUserData(parsedUser.fullName, storedUserType, storedAlternateAccess, storedRestrictedLeadSources)
          }
        } catch (err) {
          console.error("Error fetching alternate_access:", err)
          // Fallback to stored value
          const storedAlternateAccess = localStorage.getItem("alternateAccess")
          let storedRestrictedLeadSources = []
          try { storedRestrictedLeadSources = JSON.parse(localStorage.getItem("restrictedLeadSources") || "[]") } catch { /* keep [] */ }
          setAlternateAccess(storedAlternateAccess || null)
          setRestrictedLeadSources(storedRestrictedLeadSources)
          fetchUserData(parsedUser.fullName, storedUserType, storedAlternateAccess, storedRestrictedLeadSources)
        }
      }

      fetchLatestAlternateAccess()
    }
  }, [])

  // Function to fetch data based on user type FROM SUPABASE.
  // For non-admins, `fullName` (the user's Full Name, matched against the
  // "SC Assigned" / sales coordinator name on leads & enquiries) scopes the
  // data -- UNLESS `restrictedLeadSources` is non-empty, in which case that
  // completely replaces the name-based scoping with a lead_source-based one
  // (see login.restricted_lead_sources): this account sees every record
  // whose lead_source matches, regardless of who it's assigned to.
  const fetchUserData = async (fullName, userType, altAccess = null, restrictedLeadSources = []) => {
    try {
      const hasLeadSourceRestriction = Array.isArray(restrictedLeadSources) && restrictedLeadSources.length > 0;

      if (userType === "admin") {
        // Admin sees all data - fetch from appropriate Supabase tables
        const { data: leadsData, error: leadsError } = await supabase
          .from('lto_leads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        const { data: enquiryData, error: enquiryError } = await supabase
          .from('lto_enquiries')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (leadsError || enquiryError) {
          console.error("Error fetching data from Supabase:", leadsError || enquiryError);
          showNotification("Failed to fetch data from database", "error");
          return;
        }

        // Combine data from different tables
        const combinedData = {
          leads: leadsData || [],
          enquiries: enquiryData || []
        };
        
        setUserData(combinedData);
      } else if (hasLeadSourceRestriction) {
        // Lead-source-restricted user: every record whose lead_source
        // matches, regardless of who it's assigned to -- name-based scoping
        // (fullName/altAccess) does not apply at all in this branch.
        const { data: userLeads, error: userLeadsError } = await supabase
          .from('lto_leads')
          .select('*')
          .in('lead_source', restrictedLeadSources)
          .order('created_at', { ascending: false })
          .limit(100);

        const { data: userEnquiries, error: userEnquiriesError } = await supabase
          .from('lto_enquiries')
          .select('*')
          .in('lead_source', restrictedLeadSources)
          .order('created_at', { ascending: false })
          .limit(100);

        if (userLeadsError || userEnquiriesError) {
          console.error("Error fetching lead-source-restricted data from Supabase:", userLeadsError || userEnquiriesError);
          showNotification("Failed to fetch user data", "error");
          return;
        }

        setUserData({ leads: userLeads || [], enquiries: userEnquiries || [] });
      } else {
        // Regular user sees data assigned to their Full Name + any alternate_access names
        // Build a list of full names to fetch data for
        let namesToFetch = [fullName].filter(Boolean);

        // If alternate_access has comma-separated full names, add them to the list
        if (altAccess && altAccess.trim() !== '') {
          const alternateNames = altAccess.split(',').map(u => u.trim()).filter(u => u !== '');
          namesToFetch = [...new Set([...namesToFetch, ...alternateNames])];
        }

        // Fetch leads assigned (sc_name) to any of the names in the list
        const { data: userLeads, error: userLeadsError } = await supabase
          .from('lto_leads')
          .select('*')
          .in('sc_name', namesToFetch)
          .order('created_at', { ascending: false })
          .limit(100);

        // Fetch enquiries assigned (sales_person_name) to any of the names in the list
        const { data: userEnquiries, error: userEnquiriesError } = await supabase
          .from('lto_enquiries')
          .select('*')
          .in('sales_person_name', namesToFetch)
          .order('created_at', { ascending: false })
          .limit(100);

        if (userLeadsError || userEnquiriesError) {
          console.error("Error fetching user data from Supabase:", userLeadsError || userEnquiriesError);
          showNotification("Failed to fetch user data", "error");
          return;
        }

        const userSpecificData = {
          leads: userLeads || [],
          enquiries: userEnquiries || []
        };
        
        setUserData(userSpecificData);
      }
    } catch (error) {
      console.error("Data fetching error:", error);
      showNotification("An error occurred while fetching data", "error");
    }
  }

  const login = async (username, password) => {
    try {
      // Query Supabase login table - now also fetching alternate_access + full_name + restricted_lead_sources
      const { data, error } = await supabase
        .from('login')
        .select('username, usertype, alternate_access, full_name, restricted_lead_sources')
        .eq('username', username)
        .eq('password', password)
        .single()

      if (error) {
        console.error("Login error:", error);
        showNotification("Invalid credentials", "error");
        return false;
      }

      if (data) {
        // Store user info
        const userInfo = {
          username: data.username,
          fullName: data.full_name || null,
          loginTime: new Date().toISOString()
        }
        const loginRestrictedLeadSources = data.restricted_lead_sources || [];

        setIsAuthenticated(true);
        setCurrentUser(userInfo);
        setUserType(data.usertype);
        setAlternateAccess(data.alternate_access || null);
        setRestrictedLeadSources(loginRestrictedLeadSources);

        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("currentUser", JSON.stringify(userInfo));
        localStorage.setItem("userType", data.usertype);
        localStorage.setItem("alternateAccess", data.alternate_access || '');
        localStorage.setItem("restrictedLeadSources", JSON.stringify(loginRestrictedLeadSources));

        // Fetch data based on user type FROM SUPABASE, scoped by full_name + alternate_access (or lead source restriction)
        await fetchUserData(data.full_name, data.usertype, data.alternate_access, loginRestrictedLeadSources);

        showNotification(`Welcome, ${username}! (${data.usertype})`, "success");
        return true;
      } else {
        showNotification("Invalid credentials", "error");
        return false;
      }
    } catch (error) {
      console.error("Login error:", error);
      showNotification("An error occurred during login", "error");
      return false;
    }
  }

  const logout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUserType(null);
    setUserData(null);
    setAlternateAccess(null);
    setRestrictedLeadSources([]);
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("userType");
    localStorage.removeItem("alternateAccess");
    localStorage.removeItem("restrictedLeadSources");
    localStorage.removeItem('quotation_auto_save');
    showNotification("Logged out successfully", "success");
  }

  // Each call pushes its OWN toast onto a stack, keyed by a unique id --
  // duration is in ms; pass 0 (or null) to keep that specific toast up
  // until dismissNotification(id) is called for it, used for "syncing,
  // don't close this window" indicators that should stay visible for the
  // whole duration of a background operation, not just 3 seconds.
  //
  // Returns the new toast's id so a caller running a loading->result
  // sequence (e.g. a background sheet sync) can dismiss exactly ITS OWN
  // loading toast before showing its result, rather than the old
  // single-slot behavior where any two calls sharing the same message text
  // could dismiss/overwrite each other -- the real cause of the toast
  // seeming to "blink" when multiple syncs overlapped.
  const showNotification = (message, type = "info", duration = 3000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNotifications((current) => [...current, { id, message, type }]);
    if (duration) {
      setTimeout(() => {
        setNotifications((current) => current.filter((n) => n.id !== id));
      }, duration);
    }
    return id;
  }

  const dismissNotification = (id) => {
    setNotifications((current) => current.filter((n) => n.id !== id));
  }
  
  // Check if user has admin privileges
  const isAdmin = () => {
    return userType === "admin";
  }

  // Get list of Full Names to filter by (current user's Full Name + alternate access names).
  // Leads/enquiries are scoped by matching this against the "SC Assigned"
  // column (sc_name / sales_person_name / sales_coordinator_name).
  // Name kept as `getUsernamesToFilter` since it's used throughout the app as
  // the generic "names to scope this user's data by" helper.
  const getUsernamesToFilter = () => {
    let names = [currentUser?.fullName].filter(Boolean);
    if (alternateAccess && alternateAccess.trim() !== '') {
      const alternateNames = alternateAccess.split(',').map(u => u.trim()).filter(u => u !== '');
      names = [...new Set([...names, ...alternateNames])];
    }
    return names;
  }

  // True when this account is scoped by lead_source (login.restricted_lead_sources
  // is non-empty) rather than by name -- always false for admins, who are
  // never restricted by either mechanism.
  const hasLeadSourceRestriction = () => {
    return !isAdmin() && Array.isArray(restrictedLeadSources) && restrictedLeadSources.length > 0;
  }

  // Lead_source values this account is restricted to. Callers should check
  // hasLeadSourceRestriction() first and, when true, filter records by
  // lead_source using this list INSTEAD OF the usual getUsernamesToFilter()
  // name-based scoping -- the two are mutually exclusive per account.
  const getLeadSourcesToFilter = () => {
    return Array.isArray(restrictedLeadSources) ? restrictedLeadSources : [];
  }

  // Protected route component
  const ProtectedRoute = ({ children, adminOnly = false }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" />;
    }
    
    // If admin-only route and user is not admin, redirect to dashboard
    if (adminOnly && !isAdmin()) {
      showNotification("You don't have permission to access this page", "error");
      return <Navigate to="/" />;
    }
    
    return children;
  }

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      login, 
      logout, 
      showNotification,
      dismissNotification,
      currentUser,
      userType, 
      isAdmin: isAdmin,
      alternateAccess,
      getUsernamesToFilter,
      restrictedLeadSources,
      hasLeadSourceRestriction,
      getLeadSourcesToFilter
    }}>
      <DataContext.Provider value={{ userData, fetchUserData }}>
        <Router>
          <div className="flex h-screen bg-slate-50 text-gray-900 overflow-hidden">
            {isAuthenticated && (
              <Sidebar
                mobileMenuOpen={mobileMenuOpen}
                setMobileMenuOpen={setMobileMenuOpen}
              />
            )}

            <div className="flex flex-1 flex-col overflow-hidden">
              {isAuthenticated && (
                <MainNav
                  logout={logout}
                  setMobileMenuOpen={setMobileMenuOpen}
                />
              )}

              <main className={`flex-1 overflow-auto ${isAuthenticated ? 'p-4 md:p-6' : ''}`}>
                <Routes>
                  <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/leads"
                    element={
                      <ProtectedRoute>
                        <Leads />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/call-tracker"
                    element={
                      <ProtectedRoute>
                        <CallTracker />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/call-tracker/new"
                    element={
                      <ProtectedRoute>
                        <CallTrackerForm />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/call-tracker/form"
                    element={
                      <ProtectedRoute>
                        <CallTrackerForm />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/call-tracker-form"
                    element={
                      <ProtectedRoute>
                        <CallTrackerForm />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/enquiry-tracker"
                    element={
                      <ProtectedRoute>
                        <EnquiryTracker />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/enquiry-tracker/form"
                    element={
                      <ProtectedRoute>
                        <EnquiryTrackerForm />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/enquiry-tracker/new"
                    element={
                      <ProtectedRoute>
                        <EnquiryTrackerForm />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/quotation"
                    element={
                      <ProtectedRoute>
                        <Quotation key="quotation" />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/report"
                    element={
                      <ProtectedRoute>
                        <Report />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/master"
                    element={
                      <ProtectedRoute>
                        <Master />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/master/:substage"
                    element={
                      <ProtectedRoute>
                        <Master />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/setting"
                    element={
                      <ProtectedRoute adminOnly={true}>
                        <Setting />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </main>
              {isAuthenticated && <div className="bg-white border-t"><Footer /></div>}
            </div>

            <Notification notifications={notifications} />
          </div>
        </Router>
      </DataContext.Provider>
    </AuthContext.Provider>
  )
}

export default App