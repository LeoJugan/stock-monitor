import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'Missing query parameter: q' })

  const url =
    `https://query1.finance.yahoo.com/v1/finance/search` +
    `?q=${encodeURIComponent(String(q))}&quotesCount=8&newsCount=0&region=TW&lang=zh-TW`

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    })

    const data = await upstream.json()
    // 直接回傳 quotes 陣列，與 Vite proxy 行為一致
    const quotes = data?.finance?.result?.quotes ?? data?.quotes ?? []
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
    return res.status(200).json({ quotes })
  } catch (err) {
    return res.status(502).json({ error: 'Failed to fetch from Yahoo Finance search' })
  }
}
