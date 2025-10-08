import axios from 'axios'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { username, password } = req.body

  try {
    const response = await axios.post(
      `${process.env.MAGENTO_BASE_URL}/integration/admin/token`,
      { username, password },
      { headers: { 'Content-Type': 'application/json' } }
    )

    if (response.status === 200) {
      res.status(200).json({ 
        success: true, 
        token: response.data 
      })
    } else {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      })
    }
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message)
    
    // Check if API returned HTML error page
    if (error.response?.headers['content-type']?.includes('text/html')) {
      return res.status(500).json({
        success: false,
        message: 'API server error - received HTML instead of JSON response'
      })
    }
    
    res.status(401).json({ 
      success: false, 
      message: error.response?.data?.message || 'Authentication failed'
    })
  }
}