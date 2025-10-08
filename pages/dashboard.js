import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [isLoading, setIsLoading] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [reportType, setReportType] = useState('')
  const router = useRouter()

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  useEffect(() => {
    const token = localStorage.getItem('adminToken')
    if (!token) {
      router.push('/')
    }
  }, [router])

  const generateReport = async (type) => {
    setIsLoading(true)
    setReportType(type)
    setReportData(null)

    try {
      const token = localStorage.getItem('adminToken')
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reportType: type,
          month: selectedMonth,
          year: selectedYear
        })
      })

      const data = await response.json()
      if (data.success) {
        setReportData(data.data)
      } else {
        alert('Error generating report: ' + data.message)
      }
    } catch (error) {
      alert('Error: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const downloadCSV = (data, filename) => {
    const blob = new Blob([data], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">GSTR-1 Reports</h1>
          
          {/* Month/Year Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {months.map((month, index) => (
                  <option key={index} value={index + 1}>{month}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Report Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => generateReport('HSN Details')}
            disabled={isLoading}
            className="bg-secondary text-white py-3 px-6 rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center justify-center"
          >
            <span className="mr-2">📊</span> HSN Details
          </button>
          
          <button
            onClick={() => generateReport('B2C Supplies')}
            disabled={isLoading}
            className="bg-accent text-white py-3 px-6 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center"
          >
            <span className="mr-2">📍</span> B2C Supplies
          </button>
          
          <button
            onClick={() => generateReport('B2CS')}
            disabled={isLoading}
            className="bg-pink-500 text-white py-3 px-6 rounded-lg hover:bg-pink-600 disabled:opacity-50 flex items-center justify-center"
          >
            <span className="mr-2">🏪</span> B2CS
          </button>
          
          <button
            onClick={() => generateReport('Documents')}
            disabled={isLoading}
            className="bg-purple-500 text-white py-3 px-6 rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center justify-center"
          >
            <span className="mr-2">📄</span> Documents
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Generating {reportType} report...</p>
          </div>
        )}

        {/* Report Results */}
        {reportData && !isLoading && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">{reportType} Report</h2>
              <button
                onClick={() => downloadCSV(reportData.csv, reportData.filename)}
                className="bg-secondary text-white px-4 py-2 rounded-lg hover:bg-green-600 flex items-center"
              >
                <span className="mr-2">⬇️</span> Download CSV
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <div dangerouslySetInnerHTML={{ __html: reportData.html }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}