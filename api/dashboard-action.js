export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ success: false, error: 'method_not_allowed' })
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL
  if (!webhookUrl) {
    return res.status(500).json({ success: false, error: 'webhook_not_configured' })
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dashboard-token': req.headers['x-dashboard-token'] || '',
      },
      body: JSON.stringify(req.body || {}),
    })

    const text = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'application/json'
    res.status(upstream.status)
    res.setHeader('Content-Type', contentType)
    return res.send(text)
  } catch (error) {
    return res.status(502).json({ success: false, error: error.message || 'webhook_proxy_failed' })
  }
}
