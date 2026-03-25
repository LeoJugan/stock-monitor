/** 判斷是否為台灣股市交易時間（09:00–13:30，週一至週五） */
export function isTaiwanTradingTime(): boolean {
  const now = new Date()
  const tw = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))

  const day = tw.getDay() // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false

  const total = tw.getHours() * 60 + tw.getMinutes()
  return total >= 540 && total <= 810 // 09:00–13:30
}

/** 取得台灣時間字串 */
export function getTaiwanTimeStr(): string {
  return new Date().toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** 格式化日期為 MM/DD，分鐘線則顯示 HH:mm */
export function formatMMDD(dateStr: string): string {
  if (dateStr.length > 10) {
    // 分鐘線：'YYYY-MM-DD HH:mm' → 'HH:mm'
    return dateStr.slice(11, 16)
  }
  const d = new Date(dateStr + 'T00:00:00')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${m}/${day}`
}

/** 格式化成 HH:mm */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
