import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { symbol, interval, range } = req.query

  if (!symbol || !interval || !range) {
    return res.status(400).json({ error: 'Missing parameters: symbol, interval, range' })
  }

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(String(symbol))}` +
    `?interval=${interval}&range=${range}&includePrePost=false&events=`

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    })

    const data = await upstream.json()
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30')
    return res.status(upstream.status).json(data)
  } catch (err) {
    return res.status(502).json({ error: 'Failed to fetch from Yahoo Finance' })
  }
}
