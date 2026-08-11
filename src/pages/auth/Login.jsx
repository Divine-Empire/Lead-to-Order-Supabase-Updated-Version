"use client"

import React, { useState, useContext } from "react"
import { useNavigate } from "react-router-dom"
import { User, Lock, Eye, EyeOff } from "lucide-react"
import { AuthContext } from "../../App"
import Footer from "../../components/Footer"
import logoPng from "../../assests/logo.jpeg"

function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const { login } = useContext(AuthContext)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")

    if (!username || !password) {
      setError("Please enter both username and password")
      return
    }

    setIsLoading(true)

    try {
      const success = await login(username, password)
      if (success) {
        navigate("/")
      } else {
        setError("Invalid username or password")
      }
    } catch (err) {
      setError("An error occurred. Please try again.")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-white overflow-hidden">
      {/* Center Content */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 pb-14 sm:pb-16">
        <div className="w-[92%] sm:w-full max-w-[340px] sm:max-w-md bg-white border border-gray-100 rounded-2xl shadow-xl p-4 sm:p-8 space-y-3.5 sm:space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 brand-gradient" />

          {/* Logo Section */}
          <div className="flex flex-col items-center space-y-2.5 sm:space-y-4">
            <div className="w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center">
              <img src={logoPng} alt="Logo" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="text-center space-y-0.5">
              <h1 className="text-xl sm:text-3xl font-bold brand-gradient-text">Lead To Order System</h1>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs sm:text-sm text-center font-medium">
              {error}
            </div>
          )}

          {/* Form */}
          <form className="space-y-2.5 sm:space-y-4" onSubmit={handleSubmit}>
            {/* User ID Input */}
            <div className="space-y-1">
              <label htmlFor="username" className="text-[11px] sm:text-sm font-semibold text-gray-700">
                User ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  disabled={isLoading}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-9 pr-4 py-1.5 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all text-xs sm:text-sm"
                  placeholder="Enter user ID"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <label htmlFor="password" className="text-[11px] sm:text-sm font-semibold text-gray-700">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  disabled={isLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-9 pr-12 py-1.5 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all text-xs sm:text-sm"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  onClick={togglePasswordVisibility}
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Light Green Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-1.5 sm:py-2.5 px-4 text-xs sm:text-base font-bold text-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 brand-gradient hover:opacity-90 shadow-md shadow-primary/20 transition-all ${
                isLoading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

        </div>
      </div>

      {/* Footer at Bottom */}
      <div className="w-full fixed bottom-0 left-0 right-0 z-50">
        <Footer />
      </div>
    </div>
  )
}

export default Login