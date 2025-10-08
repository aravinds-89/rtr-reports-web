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
    console.error('Login error:', error.message)
    res.status(401).json({ 
      success: false, 
      message: 'Authentication failed' 
    })
  }
}