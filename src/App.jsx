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
  const [notification, setNotification] = useState(null)
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
      
      // Fetch latest alternate_access + full_name from database to ensure it's always up-to-date
      const fetchLatestAlternateAccess = async () => {
        try {
          const { data, error } = await supabase
            .from('login')
            .select('alternate_access, full_name')
            .eq('username', parsedUser.username)
            .single()

          if (!error && data) {
            const latestAlternateAccess = data.alternate_access || null
            const latestFullName = data.full_name || parsedUser.fullName || null
            setAlternateAccess(latestAlternateAccess)
            setCurrentUser(prev => ({ ...(prev || parsedUser), fullName: latestFullName }))
            localStorage.setItem("alternateAccess", latestAlternateAccess || '')
            localStorage.setItem("currentUser", JSON.stringify({ ...parsedUser, fullName: latestFullName }))
            // Fetch data with latest alternate_access, scoped by full_name (matches SC Assigned)
            fetchUserData(latestFullName, storedUserType, latestAlternateAccess)
          } else {
            // Fallback to stored value if database fetch fails
            const storedAlternateAccess = localStorage.getItem("alternateAccess")
            setAlternateAccess(storedAlternateAccess || null)
            fetchUserData(parsedUser.fullName, storedUserType, storedAlternateAccess)
          }
        } catch (err) {
          console.error("Error fetching alternate_access:", err)
          // Fallback to stored value
          const storedAlternateAccess = localStorage.getItem("alternateAccess")
          setAlternateAccess(storedAlternateAccess || null)
          fetchUserData(parsedUser.fullName, storedUserType, storedAlternateAccess)
        }
      }

      fetchLatestAlternateAccess()
    }
  }, [])

  // Function to fetch data based on user type FROM SUPABASE.
  // For non-admins, `fullName` (the user's Full Name, matched against the
  // "SC Assigned" / sales coordinator name on leads & enquiries) scopes the data.
  const fetchUserData = async (fullName, userType, altAccess = null) => {
    try {
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
      // Query Supabase login table - now also fetching alternate_access + full_name
      const { data, error } = await supabase
        .from('login')
        .select('username, usertype, alternate_access, full_name')
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

        setIsAuthenticated(true);
        setCurrentUser(userInfo);
        setUserType(data.usertype);
        setAlternateAccess(data.alternate_access || null);

        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("currentUser", JSON.stringify(userInfo));
        localStorage.setItem("userType", data.usertype);
        localStorage.setItem("alternateAccess", data.alternate_access || '');

        // Fetch data based on user type FROM SUPABASE, scoped by full_name + alternate_access
        await fetchUserData(data.full_name, data.usertype, data.alternate_access);
        
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
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("userType");
    localStorage.removeItem("alternateAccess");
    localStorage.removeItem('quotation_auto_save');
    showNotification("Logged out successfully", "success");
  }

  const showNotification = (message, type = "info") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
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
      currentUser, 
      userType, 
      isAdmin: isAdmin,
      alternateAccess,
      getUsernamesToFilter
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

            {notification && <Notification message={notification.message} type={notification.type} />}
          </div>
        </Router>
      </DataContext.Provider>
    </AuthContext.Provider>
  )
}

export default App