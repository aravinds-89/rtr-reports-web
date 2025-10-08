// Simple in-memory job store (use Redis/database in production)
const jobs = new Map()

export default function handler(req, res) {
  const { jobId } = req.query
  
  if (!jobId || !jobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' })
  }
  
  const job = jobs.get(jobId)
  res.json(job)
}

export { jobs }